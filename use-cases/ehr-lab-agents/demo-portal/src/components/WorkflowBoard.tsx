import { useEffect, useState } from 'react'
import {
  AlertOctagon, BarChartHorizontal, Bot, Check, CheckCircle2, Clock, Cog, Columns3, ExternalLink, Hand, History, RotateCcw, Square, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'
import { api, type AgentRun, type AssessmentUsage, type WorkflowStep, type WorkflowView } from '../lib/api'
import { classifyAgentFailure } from '../lib/agentErrors'
import { formatDuration, formatTime, formatTokens, formatUsd, parseTimestamp } from '../lib/format'
import { LANES, STEP_OF_RUN, laneOf } from '../lib/lanes'
import { usePolling } from '../lib/usePolling'
import { Badge, Card, CardHeader, ErrorNote, Spinner } from './ui'
import { SimulatePanel } from './SimulatePanel'
import { AgentManagerPanel } from './AgentManagerPanel'
import { WorkflowTimeline, useNow } from './WorkflowTimeline'

// The workflow made visible: the assessment's Temporal workflow as swimlanes, one per actor, read live
// from ballerina/workflow's management API (activity tree, human tasks, reviews).

const KIND_LABEL: Record<WorkflowStep['kind'], string> = {
  activity: 'Activity',
  agent: 'Agent activity',
  human: 'Human task',
  event: 'System event',
  review: 'Review',
}

type Mode = 'timeline' | 'lanes'

function savedMode(): Mode {
  try {
    return localStorage.getItem('workflow-view') === 'lanes' ? 'lanes' : 'timeline'
  } catch {
    return 'timeline'
  }
}

export function WorkflowBoard({ assessmentId }: { assessmentId: string }) {
  const { data: view, error, refresh } = usePolling(() => api.workflow(assessmentId), 2000, true, [assessmentId])
  const { data: usage } = usePolling(() => api.assessmentUsage(assessmentId).catch(() => undefined), 5000, true, [assessmentId])
  const [mode, setMode] = useState<Mode>(savedMode)
  useEffect(() => {
    try {
      localStorage.setItem('workflow-view', mode)
    } catch {
      /* storage unavailable */
    }
  }, [mode])
  if (error && !view) return <ErrorNote message={`Workflow engine unreachable: ${error}`} />
  if (!view) return <div className="flex justify-center py-20 text-ink-muted"><Spinner size={22} /></div>

  const current = view.steps.find((s) => ['running', 'retrying', 'waiting', 'attention'].includes(s.state))
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">Temporal workflow <span className="font-mono text-xs text-ink-muted">longevityAssessment · {view.workflowId}</span></h2>
              {usage && usage.totals.runs > 0 && (
                <p className="mt-0.5 text-xs text-ink-soft" title="Tokens from the agents' model calls, priced with Agent Manager's AI gateway price list">
                  AI so far: <strong className="font-medium text-ink">{formatUsd(usage.totals.costUsd)}</strong> · {formatTokens(usage.totals.inputTokens + usage.totals.outputTokens)} tokens · {usage.totals.runs} agent run{usage.totals.runs === 1 ? '' : 's'}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-line bg-sunken p-0.5" role="tablist" aria-label="Workflow view">
                <ModeTab active={mode === 'timeline'} onClick={() => setMode('timeline')} icon={<BarChartHorizontal size={13} />}>Timeline</ModeTab>
                <ModeTab active={mode === 'lanes'} onClick={() => setMode('lanes')} icon={<Columns3 size={13} />}>Swimlanes</ModeTab>
              </div>
              <Badge tone={view.status === 'COMPLETED' ? 'good' : view.status === 'RUNNING' ? 'brand' : 'act'}>
                {view.status === 'RUNNING' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />}
                {view.status}
              </Badge>
              <a className="btn-secondary py-1.5 text-xs" href={view.temporalUrl} target="_blank" rel="noreferrer">Temporal UI <ExternalLink size={12} /></a>
            </div>
          </div>
          <NowBanner view={view} current={current} />
          {mode === 'timeline' ? (
            <>
              <WorkflowTimeline view={view} runs={usage?.runs ?? []} />
              {current?.state === 'attention' && current.taskId && (
                <div className="border-t border-line px-5 py-3"><StepCard step={current} assessmentId={assessmentId} onChanged={refresh} runs={[]} /></div>
              )}
            </>
          ) : (
            <>
              <Legend />
              <Swimlanes view={view} assessmentId={assessmentId} onChanged={refresh} usage={usage} />
            </>
          )}
        </Card>
      </div>
      <aside className="space-y-4">
        <SimulatePanel />
        <AgentManagerPanel />
        <HistoryFeed view={view} />
      </aside>
    </div>
  )
}

function ModeTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${active ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}>
      {icon} {children}
    </button>
  )
}

/** Where the workflow is right now, in one line a presenter can point at, with a live clock. */
function NowBanner({ view, current }: { view: WorkflowView; current?: WorkflowStep }) {
  const live = view.status === 'RUNNING' && !!current
  const now = useNow(live)
  if (view.status === 'COMPLETED') {
    const first = view.steps.find((s) => s.startedAt)?.startedAt
    const last = [...view.steps].reverse().find((s) => s.endedAt)?.endedAt
    const took = first && last ? formatDuration(parseTimestamp(last).getTime() - parseTimestamp(first).getTime()) : undefined
    return (
      <div className="flex items-center gap-3 border-b border-line bg-good-soft/50 px-5 py-3">
        <CheckCircle2 size={20} className="shrink-0 text-good-ink" />
        <p className="text-sm font-medium text-ink">Completed{took ? ` in ${took}` : ''} — every step recorded in Temporal</p>
      </div>
    )
  }
  if (!live || !current) {
    return <div className="border-b border-line px-5 py-3 text-sm text-ink-soft">{view.status}</div>
  }
  const since = current.startedAt ? formatDuration(now - parseTimestamp(current.startedAt).getTime()) : undefined
  const tone = current.state === 'attention' ? 'bg-act-soft text-act-ink' : current.state === 'waiting' || current.state === 'retrying' ? 'bg-watch-soft/70 text-watch-ink' : 'bg-ai-soft/60 text-ai-ink'
  const failure = current.kind === 'agent' && current.failure ? classifyAgentFailure(current.failure) : undefined
  return (
    <div className={`flex items-start gap-3 border-b border-line px-5 py-3 ${tone}`}>
      <span className="mt-0.5"><StateIcon step={current} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          <span className="mr-1.5 rounded bg-surface/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">Now</span>
          {currentText(current)}
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {since && <>for {since} · </>}{LANES.find((l) => l.key === laneOf(current))?.label}
          {failure && <> · {failure.title}</>}
        </p>
      </div>
    </div>
  )
}

function currentText(step: WorkflowStep): string {
  switch (step.state) {
    case 'waiting':
      return step.kind === 'event' ? `Suspended — waiting for the lab's notification (no thread held)` : `Suspended — waiting on the ${step.actor} (human task, no thread held)`
    case 'retrying':
      return `Retrying “${step.label}” — attempt ${step.attempts || 2}`
    case 'attention':
      return `Automatic retries spent on “${step.label}” — a person must decide`
    default:
      return `Running “${step.label}”`
  }
}

function Legend() {
  const items: [string, LucideIcon][] = [['Activity', Cog], ['Agent activity', Bot], ['Human task', Hand], ['System event', Zap], ['Review', Wrench]]
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-5 py-2 text-[11px] text-ink-muted">
      {items.map(([label, Icon]) => <span key={label} className="inline-flex items-center gap-1"><Icon size={12} /> {label}</span>)}
    </div>
  )
}

function Swimlanes({ view, assessmentId, onChanged, usage }: { view: WorkflowView; assessmentId: string; onChanged: () => void; usage?: AssessmentUsage }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[36px_repeat(5,minmax(0,1fr))] border-b border-line bg-sunken/50">
          <div />
          {LANES.map(({ key, label, icon: Icon, color }) => (
            <div key={key} className="flex items-center gap-1.5 border-l border-line px-3 py-2 text-xs font-semibold text-ink-soft">
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: color }}><Icon size={11} /></span>
              {label}
            </div>
          ))}
        </div>
        {view.steps.map((step, i) => {
          const lane = LANES.findIndex((l) => l.key === laneOf(step))
          return (
            <div key={step.key} className="grid grid-cols-[36px_repeat(5,minmax(0,1fr))]">
              <div className="flex items-start justify-center pt-4 text-[11px] tabular-nums text-ink-muted">{i + 1}</div>
              {LANES.map((l, col) => (
                <div key={l.key} className="border-l border-line px-2 py-1.5">
                  {col === lane && (
                    <StepCard step={step} assessmentId={assessmentId} onChanged={onChanged}
                      runs={usage?.runs.filter((r) => r.step && STEP_OF_RUN[r.step] === step.key) ?? []} />
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function duration(step: WorkflowStep): string | undefined {
  if (step.kind === 'event' || !step.startedAt || !step.endedAt) return undefined
  const ms = parseTimestamp(step.endedAt).getTime() - parseTimestamp(step.startedAt).getTime()
  if (Number.isNaN(ms) || ms < 0) return undefined
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.round(ms / 60000)} min`
}

function StepCard({ step, assessmentId, onChanged, runs }: { step: WorkflowStep; assessmentId: string; onChanged: () => void; runs: AgentRun[] }) {
  const styles: Record<WorkflowStep['state'], string> = {
    pending: 'border-dashed border-line bg-transparent text-ink-muted',
    running: 'border-ai/40 bg-ai-soft/50 shadow-card',
    retrying: 'border-watch/60 bg-watch-soft/70 shadow-card',
    waiting: 'border-watch/50 bg-watch-soft/50 shadow-card',
    attention: 'border-act/50 bg-act-soft shadow-pop ring-2 ring-act/30',
    done: 'border-line bg-surface',
    failed: 'border-act/40 bg-act-soft',
  }
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${styles[step.state]}`}>
      <div className="flex items-start gap-1.5">
        <StateIcon step={step} />
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-medium leading-snug ${step.state === 'pending' ? 'text-ink-muted' : 'text-ink'}`}>{step.label}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
            {KIND_LABEL[step.kind]}
            {duration(step) && ` · ${duration(step)}`}
          </p>
        </div>
      </div>
      {step.detail && step.state !== 'pending' && <p className="mt-1 text-[11px] leading-snug text-ink-soft">{step.detail}</p>}
      {step.failure && (step.state === 'retrying' || step.state === 'attention' || step.state === 'failed' || step.attempts > 1) && (
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-act-ink" title={step.failure}>
          {step.kind === 'agent' ? classifyAgentFailure(step.failure).title : step.failure}
        </p>
      )}
      {runs.length > 0 && <RunUsage runs={runs} />}
      {step.state === 'attention' && step.taskId && <ReviewActions assessmentId={assessmentId} taskId={step.taskId} onChanged={onChanged} />}
    </div>
  )
}

// What the step's agent runs used, under Agent Manager's governance.
function RunUsage({ runs }: { runs: AgentRun[] }) {
  const tokens = runs.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0)
  const cost = runs.reduce((n, r) => n + (r.costUsd ?? 0), 0)
  const tools = runs.reduce((n, r) => n + r.toolCalls, 0)
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ai" title={runs.map((r) => `trace ${r.traceId}`).join('\n')}>
      <Bot size={11} /> {formatUsd(cost)} · {formatTokens(tokens)} tokens{tools > 0 && ` · ${tools} tool calls`}{runs.length > 1 && ` · ${runs.length} runs`}
    </p>
  )
}

function StateIcon({ step }: { step: WorkflowStep }) {
  const base = 'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full'
  switch (step.state) {
    case 'done':
      return <span className={`${base} bg-brand text-white dark:text-canvas`}><Check size={10} strokeWidth={3} /></span>
    case 'running':
      return <Spinner size={14} className="mt-0.5 shrink-0 text-ai" />
    case 'retrying':
      return <RotateCcw size={14} className="mt-0.5 shrink-0 animate-spin text-watch-ink [animation-duration:2s]" />
    case 'waiting':
      return step.kind === 'human' ? <Hand size={14} className="mt-0.5 shrink-0 text-watch-ink" /> : <Clock size={14} className="mt-0.5 shrink-0 text-watch-ink" />
    case 'attention':
      return <AlertOctagon size={14} className="mt-0.5 shrink-0 text-act-ink" />
    case 'failed':
      return <AlertOctagon size={14} className="mt-0.5 shrink-0 text-act-ink" />
    default:
      return <Square size={12} className="mt-0.5 shrink-0 text-line" />
  }
}

function ReviewActions({ assessmentId, taskId, onChanged }: { assessmentId: string; taskId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState<'retry' | 'stop'>()
  async function decide(retry: boolean) {
    setBusy(retry ? 'retry' : 'stop')
    try {
      await api.decideReview(assessmentId, taskId, retry)
      onChanged()
    } finally {
      setBusy(undefined)
    }
  }
  return (
    <div className="mt-2 flex gap-1.5">
      <button type="button" className="btn-primary px-2 py-1 text-[11px]" disabled={!!busy} onClick={() => decide(true)}>
        {busy === 'retry' ? <Spinner size={12} /> : <RotateCcw size={12} />} Retry
      </button>
      <button type="button" className="btn-secondary px-2 py-1 text-[11px]" disabled={!!busy} onClick={() => decide(false)}>Stop</button>
    </div>
  )
}

function HistoryFeed({ view }: { view: WorkflowView }) {
  // Timers are how a wait with a deadline is implemented; they are not steps of their own.
  const newestFirst = view.history.filter((n) => n.type !== 'TIMER').reverse()
  return (
    <Card>
      <CardHeader title="Execution history" subtitle="From Temporal, via ballerina/workflow" icon={<History size={16} />} />
      <ol className="max-h-[420px] divide-y divide-line overflow-y-auto">
        {newestFirst.map((n) => (
          <li key={n.id} className="px-4 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-medium text-ink">{n.label}</span>
              <time className="shrink-0 text-[10px] tabular-nums text-ink-muted">{n.startTime ? formatTime(n.startTime) : ''}</time>
            </div>
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">
              {n.type.replace('_', ' ').toLowerCase()} · {n.status.toLowerCase()}
              {n.attempt > 1 && ` · attempt ${n.attempt}`}
            </p>
            {n.failure && <p className="mt-0.5 line-clamp-2 text-[11px] text-act-ink">{n.failure}</p>}
          </li>
        ))}
      </ol>
    </Card>
  )
}
