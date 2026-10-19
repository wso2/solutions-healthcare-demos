import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, ChevronDown, CircleDollarSign, ExternalLink, Fingerprint, Network, OctagonAlert, ShieldCheck, ShieldX, Unplug } from 'lucide-react'
import { api, type AgentRun, type ManagedAgent } from '../lib/api'
import { classifyAgentFailure, type AgentFailure } from '../lib/agentErrors'
import { formatTokens, formatUsd } from '../lib/format'
import { usePolling } from '../lib/usePolling'
import { useSystem } from '../lib/useSystem'
import { Badge } from './ui'

// Agent Manager's governance, shown where the agent's work is: who ran it (AgentID), through which
// controls (AI gateway with the PHI guardrail, the de-identifying FHIR MCP proxy), and what it used.
// Usage comes from the trace router's ledger, priced with the AI gateway's price list.

/** The assessment step an agent run belongs to, and the managed agent that runs it. */
export const AGENT_OF_STEP = { copilot: 'copilot', analysis: 'analyst', 'care-plan': 'carePlanner' } as const
export type AgentStep = keyof typeof AGENT_OF_STEP

/** The assessment's agent runs, refreshed while an agent may still be working. */
export function useAssessmentRuns(assessmentId: string, active: boolean): AgentRun[] {
  const { data } = usePolling(() => api.assessmentUsage(assessmentId).catch(() => undefined), 5000, active, [assessmentId])
  return data?.runs ?? []
}

export function AgentReceipt({ step, runs }: { step: AgentStep; runs: AgentRun[] }) {
  const system = useSystem()
  const agent = system?.agentManager.agents.find((a) => a.key === AGENT_OF_STEP[step])
  if (!system?.agentManager.enabled || !agent) return null
  const mine = runs.filter((r) => r.step === step)
  const tokensIn = mine.reduce((n, r) => n + r.inputTokens, 0)
  const tokensOut = mine.reduce((n, r) => n + r.outputTokens, 0)
  const cost = mine.reduce((n, r) => n + (r.costUsd ?? 0), 0)
  const tools = mine.reduce((n, r) => n + r.toolCalls, 0)
  const calls = mine.reduce((n, r) => n + r.llmCalls, 0)
  const seconds = mine.reduce((n, r) => n + r.durationMs, 0) / 1000
  const failed = mine.filter((r) => !r.ok).length
  const model = mine.find((r) => r.model)?.model

  return (
    <div className="space-y-2 border-t border-line bg-sunken/40 px-5 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink"><ShieldCheck size={13} className="text-ai" /> Governed by WSO2 Agent Manager</span>
        <span className="inline-flex items-center gap-1 text-ink-soft"><Bot size={12} className="text-ai" /> {agent.displayName}</span>
        {agent.clientId && <span className="inline-flex items-center gap-1 font-mono text-ink-muted" title={`AgentID ${agent.clientId}`}><Fingerprint size={12} /> {agent.clientId.slice(0, 10)}…</span>}
        {agent.consoleUrl && (
          <a className="ml-auto inline-flex items-center gap-1 text-brand-ink hover:underline" href={agent.consoleUrl} target="_blank" rel="noreferrer">
            Traces <ExternalLink size={11} />
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ControlBadges agent={agent} />
        {mine.length > 0 ? (
          <span className="inline-flex flex-wrap items-center gap-x-2 text-ink-soft">
            <span className="inline-flex items-center gap-1 font-medium text-ink"><CircleDollarSign size={12} /> {formatUsd(cost)}</span>
            <span>{formatTokens(tokensIn)} in / {formatTokens(tokensOut)} out</span>
            <span>{calls} model call{calls === 1 ? '' : 's'}</span>
            <span>{tools} tool call{tools === 1 ? '' : 's'} via MCP</span>
            <span>{seconds.toFixed(0)} s</span>
            {model && <span className="font-mono text-ink-muted">{model}</span>}
            {mine.length > 1 && <span>{mine.length} runs</span>}
            {failed > 0 && <Badge tone="act">{failed} failed</Badge>}
          </span>
        ) : (
          <span className="text-ink-muted">Usage not recorded for this run (it predates the usage ledger).</span>
        )}
      </div>
    </div>
  )
}

function ControlBadges({ agent }: { agent: ManagedAgent }) {
  return (
    <>
      <span title="Model calls go through the agent’s own model configuration: budgets, cost metering and the PHI guardrail">
        <Badge tone={agent.llmGateway ? 'ai' : 'watch'}><Network size={11} /> {agent.llmGateway ? 'AI gateway · PHI guardrail' : 'Claude direct'}</Badge>
      </span>
      {agent.ehrAccess === 'mcp-proxy' && (
        <span title="EHR reads go through Agent Manager’s FHIR MCP proxy: the AgentID role decides the tools, mcp-fhir-deidentify rewrites the results">
          <Badge tone="good"><ShieldCheck size={11} /> EHR via MCP proxy · de-identified</Badge>
        </span>
      )}
      {agent.ehrAccess === 'none' && <Badge>No EHR access</Badge>}
      {agent.ehrAccess === 'direct' && <Badge tone="watch">EHR direct</Badge>}
    </>
  )
}

const failureIcon = { budget: CircleDollarSign, tokens: CircleDollarSign, rate: CircleDollarSign, permission: ShieldX, credit: CircleDollarSign, upstream: Unplug, gateway: OctagonAlert, unknown: OctagonAlert }

/** An agent failure, explained: which control acted (or what broke), what to do, and the raw reason. */
export function AgentFailureNote({ message, failure: given, compact = false, hint }: { message?: string; failure?: AgentFailure; compact?: boolean; hint?: string }) {
  const [open, setOpen] = useState(false)
  const failure = given ?? classifyAgentFailure(message ?? '')
  const Icon = failureIcon[failure.kind]
  const tone = failure.governed ? 'border-watch/50 bg-watch-soft/70 text-watch-ink' : 'border-act/25 bg-act-soft text-act-ink'
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <div className="flex items-start gap-2">
        <Icon size={compact ? 14 : 16} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold`}>
            {failure.title}
            {failure.status && <span className="ml-1.5 font-mono text-[11px] font-normal opacity-80">HTTP {failure.status}</span>}
          </p>
          {!compact && <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{failure.explanation}{hint ? ` ${hint}` : ''}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {(failure.kind === 'budget' || failure.kind === 'tokens') && (
              <Link to="/agent-manager" className="text-xs font-medium underline-offset-2 hover:underline">Budgets in Agent Manager →</Link>
            )}
            <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-0.5 text-[11px] opacity-80 hover:opacity-100">
              Details <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {open && <p className="mt-1 break-words font-mono text-[11px] leading-snug text-ink-soft">{failure.raw}</p>}
        </div>
      </div>
    </div>
  )
}
