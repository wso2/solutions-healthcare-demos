import { useEffect, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import {
  Bot, Check, ChevronDown, CircleDollarSign, ExternalLink, EyeOff, FileLock2, Fingerprint, Gauge, Minus, Network, Play, RefreshCw, ShieldCheck,
  ShieldOff, X,
} from 'lucide-react'
import {
  api, type AccessCell, type AccessMatrix, type AgentManagerInfo, type AgentPermission, type AgentUsage, type DeidentifySample, type ManagedAgent,
  type ProbeResult, type UsageHour, type UsageSummary,
} from '../lib/api'
import { markDemo } from '../lib/demoProgress'
import { formatTime, formatTokens, formatUsd } from '../lib/format'
import { usePolling } from '../lib/usePolling'
import { Badge, Card, CardHeader, ErrorNote, Spinner } from '../components/ui'

// WSO2 Agent Manager, as the presenter shows it: who each agent is (its AgentID and roles), what it may do
// — asked live of Agent Manager's identity provider — and real MCP calls made as each agent, which the
// gateway allows or refuses. Below: the PHI guardrail and the evaluation monitors.

export function AgentManagerPage() {
  const [info, setInfo] = useState<AgentManagerInfo>()
  const [matrix, setMatrix] = useState<AccessMatrix>()
  const [error, setError] = useState<string>()
  const [checking, setChecking] = useState(false)

  async function check() {
    setChecking(true)
    setError(undefined)
    try {
      setMatrix(await api.agentAccess())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    api.system().then((s) => setInfo(s.agentManager)).catch((e) => setError(String(e)))
    void check()
  }, [])

  if (!info) return <div className="flex justify-center py-24 text-ink-muted">{error ? <ErrorNote message={error} /> : <Spinner size={22} />}</div>

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            {info.enabled ? <ShieldCheck size={20} className="text-good-ink" /> : <ShieldOff size={20} className="text-ink-muted" />}
            WSO2 Agent Manager
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-soft">
            Every agent has its own identity. Its roles decide which MCP tools it may call, the AI gateway meters and guards its
            model calls, and every run is traced and evaluated.
          </p>
        </div>
        <a className="btn-secondary" href={info.consoleUrl} target="_blank" rel="noreferrer">Open the console <ExternalLink size={14} /></a>
      </header>

      {!info.enabled && (
        <Card><p className="px-5 py-4 text-sm text-ink-soft">The agents are not registered yet. Run <code className="font-mono">./scripts/amp-setup.sh</code>.</p></Card>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {info.agents.map((agent) => <AgentCard key={agent.key} agent={agent} />)}
      </section>

      <Card>
        <CardHeader
          title="What each agent may do — asked live of Agent Manager"
          subtitle={matrix ? `AgentID tokens from ${matrix.issuer || '—'} · checked ${formatTime(matrix.checkedAt)}` : 'Requesting each agent’s token for each permission…'}
          icon={<Fingerprint size={16} />}
          action={
            <button type="button" className="btn-secondary py-1 text-xs" onClick={check} disabled={checking}>
              {checking ? <Spinner size={12} /> : <RefreshCw size={12} />} Re-check
            </button>
          }
        />
        {error && <div className="px-5 py-3"><ErrorNote message={error} /></div>}
        {matrix ? <Matrix matrix={matrix} /> : <div className="flex justify-center py-10 text-ink-muted"><Spinner /></div>}
        <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-muted">
          Each cell requests the agent’s token for that scope (client credentials, the MCP proxy as the resource); the identity
          provider grants only what the agent’s roles carry. <strong className="font-medium text-ink-soft">Try</strong> makes a
          real, harmless MCP call as the agent through the proxy — change a role in the console and re-check.
          Writes are never probed.
        </p>
      </Card>

      <CostCard info={info} />

      <FhirPolicyCard />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="PHI guardrail on the AI gateway" subtitle="pii-masking-regex · redaction" icon={<EyeOff size={16} />} />
          <div className="space-y-3 px-5 py-4 text-sm text-ink-soft">
            <p>Before any agent request reaches Claude, the gateway redacts identifiers in the whole request — the history and the FHIR data in tool results too. Claude never sees them, so it cannot repeat them in a note or a patient report. Agents address the EHR by FHIR resource id, which is not PHI.</p>
            <div className="flex flex-wrap gap-1.5">
              {['MRN-… / ATH-…', 'SSN', 'Phone'].map((t) => <Badge key={t} tone="ai">{t}</Badge>)}
            </div>
            <p className="font-mono text-xs text-ink-muted">“MRN-100234” → Claude sees “*****”</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Evaluation" subtitle="One monitor per agent, every 10 minutes" icon={<Gauge size={16} />} />
          <ul className="divide-y divide-line text-sm">
            {[
              ['Diagnostic Copilot', 'helpfulness · instruction following · orderable tests only · citation integrity · PHI leak · EHR read-only'],
              ['Results Analysis', 'completeness · reasoning quality · clinical grounding · tool success · PHI leak · EHR read-only'],
              ['Care Plan', 'clarity · patient-friendly tone · safety · medication safety · length · PHI leak'],
            ].map(([agent, evaluators]) => (
              <li key={agent} className="px-5 py-2.5">
                <p className="font-medium text-ink">{agent}</p>
                <p className="text-xs text-ink-muted">{evaluators}</p>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  )
}

function AgentCard({ agent }: { agent: ManagedAgent }) {
  return (
    <Card>
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-1.5 font-semibold text-ink"><Bot size={16} className="text-ai" /> {agent.displayName}</p>
          {agent.consoleUrl && (
            <a className="inline-flex items-center gap-1 text-xs text-brand-ink hover:underline" href={agent.consoleUrl} target="_blank" rel="noreferrer">
              Traces <ExternalLink size={11} />
            </a>
          )}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">AgentID</p>
          <p className="truncate font-mono text-xs text-ink-soft">{agent.clientId || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">Roles</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {agent.roles.length ? agent.roles.map((r) => <Badge key={r} tone="brand">{r}</Badge>) : <span className="text-xs text-ink-muted">none</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge tone={agent.llmGateway ? 'ai' : 'watch'}><Network size={11} /> {agent.llmGateway ? 'Own model config · AI gateway' : 'Claude direct'}</Badge>
        </div>
      </div>
    </Card>
  )
}

function Matrix({ matrix }: { matrix: AccessMatrix }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line bg-sunken/50 text-left">
            <th className="px-5 py-2.5 text-xs font-semibold text-ink-soft">Agent</th>
            {matrix.permissions.map((p) => (
              <th key={p.key} className="px-3 py-2.5 text-xs font-semibold text-ink-soft">
                {p.label}
                <span className="block font-mono text-[10px] font-normal text-ink-muted">{p.scope}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {matrix.rows.map((row) => (
            <tr key={row.key}>
              <td className="px-5 py-3 align-top">
                <p className="font-medium text-ink">{row.displayName}</p>
                <p className="text-xs text-ink-muted">{row.roles.join(' · ') || 'no roles'}</p>
              </td>
              {matrix.permissions.map((p) => (
                <Cell key={p.key} agent={row.key} permission={p} cell={row.cells.find((c) => c.permission === p.key)} enabled={matrix.enabled} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cell({ agent, permission, cell, enabled }: { agent: string; permission: AgentPermission; cell?: AccessCell; enabled: boolean }) {
  const [probe, setProbe] = useState<ProbeResult>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function run() {
    setBusy(true)
    setError(undefined)
    try {
      setProbe(await api.probeAccess(agent, permission.key))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const granted = cell?.granted ?? false
  return (
    <td className="px-3 py-3 align-top">
      <span title={cell?.detail} className="inline-flex">
        {granted
          ? <Badge tone="good"><Check size={11} strokeWidth={3} /> Granted</Badge>
          : <Badge tone="neutral"><Minus size={11} /> Not granted</Badge>}
      </span>
      {permission.probeTool && enabled && (
        <div className="mt-1.5">
          <button type="button" className="inline-flex items-center gap-1 text-xs text-brand-ink hover:underline disabled:opacity-50" onClick={run} disabled={busy}>
            {busy ? <Spinner size={11} /> : <Play size={11} />} Try {permission.probeTool}
          </button>
          {probe && (
            <p className={`mt-1 flex items-start gap-1 text-[11px] leading-snug ${probe.allowed ? 'text-good-ink' : probe.outcome === 'refused' ? 'text-act-ink' : 'text-watch-ink'}`} title={probe.detail}>
              {probe.allowed ? <Check size={11} className="mt-0.5 shrink-0" /> : <X size={11} className="mt-0.5 shrink-0" />}
              <span>{probe.allowed ? 'Allowed' : probe.outcome === 'refused' ? 'Refused by Agent Manager' : 'Failed'} · {probe.durationMs} ms</span>
            </p>
          )}
          {error && <p className="mt-1 text-[11px] text-act-ink">{error}</p>}
        </div>
      )}
    </td>
  )
}

// Spend per agent against the budget Agent Manager enforces on its model configuration. Spend comes from
// the agents' traces priced with the AI gateway's own price list, so it mirrors the gateway's counters;
// the gateway is what refuses an agent over budget (429).
function CostCard({ info }: { info: AgentManagerInfo }) {
  const { data: usage, error } = usePolling(() => api.usage(), 5000)
  const names = Object.fromEntries(info.agents.map((a) => [a.name, a.displayName]))
  return (
    <Card>
      <CardHeader
        title="AI cost and budgets — per agent"
        subtitle={usage ? `Priced with ${usage.pricedWith} · ${Object.entries(usage.prices).map(([m, p]) => `${m}: $${(p.input_cost_per_token * 1e6).toFixed(2)} / $${(p.output_cost_per_token * 1e6).toFixed(2)} per M tokens in / out`).join(' · ')}` : 'Reading the usage ledger…'}
        icon={<CircleDollarSign size={16} />}
      />
      {error && !usage && <div className="px-5 py-3"><ErrorNote message={error} /></div>}
      {usage && (
        <>
          <Kpis usage={usage} info={info} />
          <div className="grid gap-px border-t border-line bg-line md:grid-cols-3">
            {info.agents.map((a) => <BudgetTile key={a.key} name={a.displayName} usage={usage.agents[a.name]} />)}
          </div>
          <RecentRuns usage={usage} names={names} />
        </>
      )}
      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-muted">
        Each agent reaches Claude through its own model configuration in Agent Manager, whose policies cap that agent alone:
        <span className="font-mono"> llm-cost-based-ratelimit</span> (US$ per day, priced by <span className="font-mono">llm-cost</span>) and
        <span className="font-mono"> token-based-ratelimit</span> (tokens per hour). Over budget the gateway answers 429; the workflow step
        retries, then waits for operations to raise the budget and retry. Demo: <code className="font-mono">./scripts/amp-budgets.sh --exhaust care-planner</code>.
      </p>
    </Card>
  )
}

/** The day at a glance, across the three agents. */
function Kpis({ usage, info }: { usage: UsageSummary; info: AgentManagerInfo }) {
  const agents = info.agents.map((a) => ({ name: a.displayName, u: usage.agents[a.name] }))
  const spent = agents.reduce((n, a) => n + (a.u?.last24h.costUsd ?? 0), 0)
  const budget = agents.reduce((n, a) => n + (a.u?.budget?.usdPerDay ?? 0), 0)
  const runs = agents.reduce((n, a) => n + (a.u?.last24h.runs ?? 0), 0)
  const failed = agents.reduce((n, a) => n + (a.u?.last24h.failed ?? 0), 0)
  const tokens = agents.reduce((n, a) => n + (a.u?.last24h.inputTokens ?? 0) + (a.u?.last24h.outputTokens ?? 0), 0)
  const closest = agents
    .filter((a) => a.u?.budget?.usdPerDay && ((a.u.last24h.costUsd ?? 0) > 0 || a.u.budget.exhausted))
    .map((a) => ({ name: a.name, ratio: (a.u!.last24h.costUsd ?? 0) / a.u!.budget!.usdPerDay, exhausted: a.u!.budget!.exhausted }))
    .sort((a, b) => (b.exhausted ? 2 : b.ratio) - (a.exhausted ? 2 : a.ratio))[0]
  const tiles = [
    { label: 'Spend, last 24 h', value: formatUsd(spent), sub: budget ? `of ${formatUsd(budget)} in daily budgets` : 'no budgets set' },
    { label: 'Agent runs, last 24 h', value: String(runs), sub: failed ? `${failed} failed` : 'none failed', alert: failed > 0 },
    { label: 'Tokens, last 24 h', value: formatTokens(tokens), sub: 'input + output' },
    { label: 'Closest to its budget', value: closest ? closest.name : '—', sub: closest ? (closest.exhausted ? 'exhausted (demo)' : `${Math.round(closest.ratio * 100)}% of today’s budget`) : budget ? 'nothing spent yet' : 'no budgets set', alert: closest?.exhausted },
  ]
  return (
    <dl className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="bg-surface px-5 py-3">
          <dt className="text-xs text-ink-muted">{t.label}</dt>
          <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums text-ink">{t.value}</dd>
          <dd className={`text-xs ${t.alert ? 'text-act-ink' : 'text-ink-muted'}`}>{t.sub}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Spend per hour over the last 24 hours: one agent, one hue, hover for the figures. */
function HourlySpend({ hours }: { hours?: UsageHour[] }) {
  if (!hours?.length) return null
  const now = new Date()
  const data = hours.map((h, i) => {
    const start = new Date(now.getTime() - (23 - i) * 3600_000)
    start.setMinutes(0, 0, 0)
    return { ...h, label: start.toLocaleTimeString('en-US', { hour: 'numeric' }), i }
  })
  const max = Math.max(...data.map((d) => d.costUsd))
  if (max === 0) return <p className="flex justify-between text-xs text-ink-soft"><span>Spend per hour, last 24 h</span><span className="text-ink-muted">no spend</span></p>
  return (
    <div>
      <p className="flex justify-between text-xs text-ink-soft"><span>Spend per hour, last 24 h</span></p>
      <div className="mt-1 h-14" role="img" aria-label={`Hourly spend, last 24 hours; peak ${formatUsd(max)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
            <XAxis dataKey="label" hide />
            <Tooltip
              cursor={{ fill: 'rgb(var(--sunken))' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as UsageHour & { label: string }
                return (
                  <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop">
                    <p className="font-medium text-ink">{d.label}</p>
                    <p className="text-ink-soft">{formatUsd(d.costUsd)} · {d.runs} run{d.runs === 1 ? '' : 's'}{d.failed ? ` (${d.failed} failed)` : ''}</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="costUsd" fill="rgb(var(--ai))" radius={[4, 4, 0, 0]} minPointSize={(v) => ((v ?? 0) > 0 ? 2 : 0)} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function BudgetTile({ name, usage }: { name: string; usage?: AgentUsage }) {
  const budget = usage?.budget
  const spent = usage?.last24h.costUsd ?? 0
  const hourTokens = (usage?.lastHour.inputTokens ?? 0) + (usage?.lastHour.outputTokens ?? 0)
  return (
    <div className="space-y-2.5 bg-surface px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-ink">{name}</p>
        {budget?.exhausted && <Badge tone="act">Budget exhausted (demo)</Badge>}
      </div>
      <Meter label="Spend, last 24 h" value={spent} limit={budget?.usdPerDay} format={formatUsd} />
      <Meter label="Tokens, last hour" value={hourTokens} limit={budget?.tokensPerHour} format={formatTokens} />
      <HourlySpend hours={usage?.hourly} />
      <p className="text-xs text-ink-muted">
        {usage ? `${usage.allTime.runs} runs · ${formatUsd(usage.allTime.costUsd)} all time · ${formatTokens(usage.allTime.inputTokens)} in / ${formatTokens(usage.allTime.outputTokens)} out` : 'No runs yet'}
      </p>
    </div>
  )
}

function Meter({ label, value, limit, format }: { label: string; value: number; limit?: number; format: (n: number) => string }) {
  const ratio = limit ? Math.min(value / limit, 1) : 0
  const tone = !limit ? 'bg-line' : value >= limit ? 'bg-act' : ratio >= 0.8 ? 'bg-watch' : 'bg-ai'
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-soft">{label}</span>
        <span className="tabular-nums text-ink">{format(value)}{limit ? <span className="text-ink-muted"> of {format(limit)}</span> : <span className="text-ink-muted"> · no budget</span>}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken" role="meter" aria-valuenow={value} aria-valuemax={limit} aria-label={label}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(ratio * 100, value > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  )
}

function RecentRuns({ usage, names }: { usage: UsageSummary; names: Record<string, string> }) {
  if (usage.runs.length === 0) return null
  return (
    <div className="max-h-72 overflow-auto border-t border-line">
      <table className="w-full min-w-[640px] text-xs">
        <thead className="sticky top-0 bg-sunken text-left text-ink-soft">
          <tr>
            <th className="px-5 py-2 font-semibold">Run</th>
            <th className="px-3 py-2 font-semibold">Agent</th>
            <th className="px-3 py-2 font-semibold">Assessment</th>
            <th className="px-3 py-2 text-right font-semibold">Tokens in / out</th>
            <th className="px-3 py-2 text-right font-semibold">Model calls · tools</th>
            <th className="px-3 py-2 text-right font-semibold">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {usage.runs.slice(0, 20).map((r) => (
            <tr key={r.traceId + r.startedAt} title={`trace ${r.traceId}`}>
              <td className="px-5 py-1.5 tabular-nums text-ink-muted">{formatTime(new Date(r.startedAt * 1000).toISOString())} · {(r.durationMs / 1000).toFixed(0)} s</td>
              <td className="px-3 py-1.5 text-ink">{names[r.agent] ?? r.agent}{!r.ok && <Badge tone="act">failed</Badge>}</td>
              <td className="px-3 py-1.5 font-mono text-ink-muted">{r.assessmentId ?? '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatTokens(r.inputTokens)} / {formatTokens(r.outputTokens)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.llmCalls} · {r.toolCalls}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-medium text-ink">{formatUsd(r.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// mcp-fhir-deidentify: a custom gateway policy on the FHIR MCP proxies (gateway/policies/mcp-fhir-deidentify,
// rules in amp/fhir-deidentify.json). What the agents get back from the EHR tools.
function FhirPolicyCard() {
  const [sample, setSample] = useState<DeidentifySample>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [showJson, setShowJson] = useState(false)

  async function tryIt() {
    setBusy(true)
    setError(undefined)
    try {
      const patients = await api.searchPatients('cerner', '')
      if (!patients.length) throw new Error('No patients in the Cerner EHR')
      setSample(await api.deidentifySample('cerner', patients[0].id))
      markDemo('fhir')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const example: [string, string, string][] = [
    ['Patient.name', 'Crystal Schmeler', 'removed'],
    ['Patient.telecom (phone)', '555-291-4926', '********4926'],
    ['Patient.birthDate', '1971-10-12', '1971'],
    ['Patient.identifier (MRN)', 'MRN-201485', 'h_… (keyed pseudonym)'],
    ['Patient.address', '877 Ankunding Run, Boston 02199 + lat/long', 'state and country only'],
    ['Observation', 'note, performer, issued, …', 'clinical elements only (allowlist)'],
    ['DocumentReference, Communication, Claim, …', 'notes, messages, billing', 'withheld'],
    ['search Patient?family=…', 'name, birthdate, identifier, phone…', 'refused before the EHR'],
  ]
  const rows = sample ? compareSample(sample) : example
  return (
    <Card>
      <div id="fhir" className="scroll-mt-20" />
      <CardHeader
        title="FHIR de-identification on the MCP proxies"
        subtitle="mcp-fhir-deidentify · custom gateway policy, attached in Agent Manager"
        icon={<FileLock2 size={16} />}
        action={
          <button type="button" className="btn-secondary py-1 text-xs" onClick={tryIt} disabled={busy}>
            {busy ? <Spinner size={12} /> : <Play size={12} />} {sample ? 'Read again' : 'Try it live'}
          </button>
        }
      />
      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-2 text-sm text-ink-soft">
          <p>The WSO2 FHIR MCP server returns whole FHIR resources. Before a tool result reaches an agent — and so Claude — the gateway applies per-resource rules (FHIRPath): redact, mask, hash, generalize, an allowlist, or deny a type. Bundles, <span className="font-mono">_include</span>d and contained resources are covered; narrative text and reference display names are removed; changed resources carry <span className="font-mono">meta.security</span> labels.</p>
          <p>It fails closed — a result it cannot parse becomes an error, never raw data — and the agent cannot switch it off, unlike a filter the model chooses to send.</p>
        </div>
        <div className="min-w-0 space-y-2">
        {error && <ErrorNote message={error} />}
        <p className="text-[11px] text-ink-muted">
          {sample
            ? <>Live · Patient/{sample.patientId} read directly from the FHIR server, and with the MCP <span className="font-mono">read</span> tool as the Diagnostic Copilot through Agent Manager · {sample.durationMs} ms{!sample.allowed && ' · the proxy refused or withheld the result'}</>
            : <>Example. <strong className="font-medium text-ink-soft">Try it live</strong> reads one Patient both ways — an MCP call, no model involved.</>}
        </p>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead className="text-left text-ink-soft"><tr><th className="py-1.5 font-semibold">Element</th><th className="py-1.5 font-semibold">FHIR server</th><th className="py-1.5 font-semibold">Agent receives</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map(([el, from, to]) => (
              <tr key={el}>
                <td className="py-1.5 pr-2 font-mono text-ink">{el}</td>
                <td className="py-1.5 pr-2 text-ink-muted">{from}</td>
                <td className={`py-1.5 font-medium ${to === from ? 'text-ink-muted' : 'text-good-ink'}`}>{to}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {sample && (
          <div>
            <button type="button" onClick={() => setShowJson(!showJson)} className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
              Both resources as JSON <ChevronDown size={13} className={`transition ${showJson ? 'rotate-180' : ''}`} />
            </button>
            {showJson && (
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {([['FHIR server', sample.raw], ['Agent receives', sample.governed]] as const).map(([label, json]) => (
                  <div key={label} className="min-w-0">
                    <p className="mb-1 text-[11px] font-semibold text-ink-soft">{label}</p>
                    <pre className="max-h-72 overflow-auto rounded-lg bg-sunken/70 p-2 font-mono text-[10px] leading-relaxed text-ink-soft">{JSON.stringify(json, null, 2)}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </Card>
  )
}

type Json = Record<string, unknown>
const asObj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** The elements the policy changes, side by side, from a live sample. */
function compareSample(sample: DeidentifySample): [string, string, string][] {
  const raw = asObj(sample.raw)
  const gov = asObj(sample.governed)
  const removed = 'removed'
  const name = (r: Json) => {
    const n = asObj(asArr(r.name)[0])
    const text = [...asArr(n.given), n.family].filter(Boolean).join(' ')
    return text || removed
  }
  const telecom = (r: Json, system: string) => String(asObj(asArr(r.telecom).find((t) => asObj(t).system === system)).value ?? removed)
  const identifier = (r: Json) => String(asObj(asArr(r.identifier)[0]).value ?? removed)
  const address = (r: Json) => {
    const a = asObj(asArr(r.address)[0])
    const parts = [...asArr(a.line), a.city, a.district, a.postalCode, a.state, a.country].filter(Boolean)
    return parts.length ? parts.join(', ') : removed
  }
  const labels = asArr(asObj(gov.meta).security).map((l) => String(asObj(l).code ?? '')).filter(Boolean)
  return [
    ['Patient.name', name(raw), name(gov)],
    ['Patient.telecom (phone)', telecom(raw, 'phone'), telecom(gov, 'phone')],
    ['Patient.telecom (email)', telecom(raw, 'email'), telecom(gov, 'email')],
    ['Patient.birthDate', String(raw.birthDate ?? '—'), String(gov.birthDate ?? removed)],
    ['Patient.identifier (MRN)', identifier(raw), identifier(gov)],
    ['Patient.address', address(raw), address(gov)],
    ['Patient.text (narrative)', raw.text ? 'present' : 'none', gov.text ? 'present' : removed],
    ['meta.security', '—', labels.length ? labels.join(', ') : 'none'],
  ]
}
