import { useEffect, useState } from 'react'
import { Bot, ExternalLink, Fingerprint, Network, ShieldCheck, ShieldOff } from 'lucide-react'
import { api, type AgentManagerInfo, type ManagedAgent } from '../lib/api'
import { Badge, Card, CardHeader } from './ui'

// How WSO2 Agent Manager governs the three agents: each one's identity (AgentID), whether its model
// calls go through the AI gateway, how it reaches the EHR, and a link to its traces in the console.

export function AgentManagerPanel() {
  const [info, setInfo] = useState<AgentManagerInfo>()
  useEffect(() => {
    api.system().then((s) => setInfo(s.agentManager)).catch(() => undefined)
  }, [])
  if (!info) return null

  return (
    <Card>
      <CardHeader
        title="WSO2 Agent Manager"
        subtitle={info.enabled ? 'Identity, AI gateway and traces per agent' : 'Not connected — agents call Claude and the EHR directly'}
        icon={info.enabled ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
        action={info.enabled && (
          <a className="btn-secondary py-1 text-xs" href={info.consoleUrl} target="_blank" rel="noreferrer">Console <ExternalLink size={12} /></a>
        )}
      />
      {info.enabled ? (
        <ul className="divide-y divide-line">
          {info.agents.map((agent) => <AgentRow key={agent.key} agent={agent} />)}
        </ul>
      ) : (
        <p className="px-4 py-3 text-xs leading-snug text-ink-muted">
          Run <code className="font-mono">./scripts/amp-setup.sh</code> to register the agents: each gets its own identity, its own AI gateway key and its own traces.
        </p>
      )}
    </Card>
  )
}

function AgentRow({ agent }: { agent: ManagedAgent }) {
  const ehr = {
    'mcp-proxy': { label: 'EHR via MCP proxy', tone: 'good' as const, title: 'Reads the EHR through Agent Manager’s MCP proxy; its AgentID role decides which FHIR MCP tools it may call' },
    direct: { label: 'EHR direct', tone: 'watch' as const, title: 'Talks to the FHIR MCP server directly, without an identity check' },
    none: { label: 'No EHR access', tone: 'neutral' as const, title: 'Has no EHR tools at all — it works only from the analysis' },
  }[agent.ehrAccess]
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Bot size={14} className="shrink-0 text-ai" />
          <p className="truncate text-sm font-medium text-ink">{agent.displayName}</p>
        </div>
        {agent.consoleUrl && (
          <a className="inline-flex shrink-0 items-center gap-1 text-xs text-brand-ink hover:underline" href={agent.consoleUrl} target="_blank" rel="noreferrer">
            Traces <ExternalLink size={11} />
          </a>
        )}
      </div>
      <p className="mt-1 flex items-center gap-1 truncate font-mono text-[11px] text-ink-muted" title="AgentID client id">
        <Fingerprint size={11} className="shrink-0" /> {agent.clientId || 'no AgentID'}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Badge tone={agent.llmGateway ? 'ai' : 'watch'}>
          <Network size={11} /> {agent.llmGateway ? 'AI gateway' : 'Claude direct'}
        </Badge>
        <span title={ehr.title}><Badge tone={ehr.tone}>{ehr.label}</Badge></span>
      </div>
    </li>
  )
}
