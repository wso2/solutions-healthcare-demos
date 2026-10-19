import { useEffect, useState, type MouseEvent } from 'react'
import type { AgentRun, WorkflowStep, WorkflowView } from '../lib/api'
import { classifyAgentFailure } from '../lib/agentErrors'
import { formatDuration, formatTime, formatTokens, formatUsd, parseTimestamp } from '../lib/format'
import { LANES, STEP_OF_RUN, laneFor } from '../lib/lanes'

// The workflow on a clock: one row per step, bars placed and sized by when the step really ran. Waits on
// people are hatched (the workflow is suspended and holds no thread); activities are solid; the lab's
// notification is a point in time. Very short activities keep a minimum width so they stay visible and
// hoverable; the tooltip carries the exact figures.

const KIND_LABEL: Record<WorkflowStep['kind'], string> = {
  activity: 'Activity', agent: 'Agent activity', human: 'Human task', event: 'System event', review: 'Review',
}

interface Placed {
  step: WorkflowStep
  start?: number
  end?: number
}

export function WorkflowTimeline({ view, runs }: { view: WorkflowView; runs: AgentRun[] }) {
  const running = view.status === 'RUNNING'
  const now = useNow(running)
  const [hover, setHover] = useState<{ p: Placed; left: number; top: number }>()
  const placed: Placed[] = view.steps.map((step) => {
    const start = step.startedAt ? parseTimestamp(step.startedAt).getTime() : undefined
    const end = step.endedAt ? parseTimestamp(step.endedAt).getTime() : start !== undefined && step.state !== 'done' ? now : start
    return { step, start, end }
  })
  const starts = placed.flatMap((p) => (p.start !== undefined ? [p.start] : []))
  const ends = placed.flatMap((p) => (p.end !== undefined ? [p.end] : []))
  if (starts.length === 0) return <p className="px-5 py-8 text-center text-sm text-ink-muted">The workflow has not started a step yet.</p>
  const t0 = Math.min(...starts)
  const t1 = Math.max(...ends, running ? now : 0)
  const span = Math.max(t1 - t0, 1000)
  const x = (t: number) => ((t - t0) / span) * 100

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, label: f === 0 ? formatTime(new Date(t0).toISOString()) : `+${formatDuration(span * f)}` }))

  function onMove(p: Placed, e: MouseEvent<HTMLDivElement>) {
    const box = (e.currentTarget.closest('[data-timeline]') as HTMLElement).getBoundingClientRect()
    setHover({ p, left: e.clientX - box.left, top: e.clientY - box.top })
  }

  return (
    <div className="relative" data-timeline onMouseLeave={() => setHover(undefined)}>
      <div className="grid grid-cols-[minmax(0,190px)_minmax(0,1fr)] border-b border-line bg-sunken/50 text-[10px] text-ink-muted sm:grid-cols-[230px_minmax(0,1fr)]">
        <div className="px-3 py-2 text-xs font-semibold text-ink-soft">Step</div>
        <div className="relative mr-6 h-8">
          {ticks.map(({ f, label }) => (
            <span key={f} className={`absolute top-2 whitespace-nowrap tabular-nums ${f === 0 ? '' : f === 1 ? '-translate-x-full' : '-translate-x-1/2'} ${f > 0 && f < 1 ? 'hidden sm:inline' : ''}`} style={{ left: `${f * 100}%` }}>{label}</span>
          ))}
        </div>
      </div>
      <ol>
        {placed.map((p) => {
          const lane = laneFor(p.step)
          const Icon = lane.icon
          const runsHere = runs.filter((r) => r.step && STEP_OF_RUN[r.step] === p.step.key)
          const cost = runsHere.reduce((n, r) => n + (r.costUsd ?? 0), 0)
          const pending = p.start === undefined
          return (
            <li key={p.step.key} className="grid grid-cols-[minmax(0,190px)_minmax(0,1fr)] border-b border-line/60 last:border-0 sm:grid-cols-[230px_minmax(0,1fr)]">
              <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: pending ? 'rgb(var(--line))' : lane.color }} title={lane.label}>
                  <Icon size={11} />
                </span>
                <div className="min-w-0">
                  <p className={`truncate text-xs font-medium ${pending ? 'text-ink-muted' : 'text-ink'}`}>{p.step.label}</p>
                  <p className="truncate text-[10px] text-ink-muted">
                    {pending ? 'Not started' : p.step.kind === 'event' ? formatTime(new Date(p.start!).toISOString()) : formatDuration((p.end ?? p.start!) - p.start!)}
                    {p.step.state === 'waiting' && ' · waiting'}
                    {runsHere.length > 0 && ` · ${formatUsd(cost)}`}
                  </p>
                </div>
              </div>
              <div className="relative mr-6 h-10 cursor-default" onMouseMove={(e) => !pending && onMove(p, e)} onMouseLeave={() => setHover(undefined)}>
                {!pending && <Bar p={p} x={x} color={lane.color} />}
              </div>
            </li>
          )
        })}
      </ol>
      {running && (
        <div className="pointer-events-none absolute bottom-0 top-8 grid w-full grid-cols-[minmax(0,190px)_minmax(0,1fr)] sm:grid-cols-[230px_minmax(0,1fr)]" aria-hidden>
          <div />
          <div className="relative mr-6">
            <span className="absolute bottom-0 top-0 w-px bg-brand" style={{ left: `${x(now)}%` }} />
            <span className="absolute -top-1 -translate-x-1/2 rounded bg-brand px-1 text-[9px] font-semibold uppercase text-white dark:text-canvas" style={{ left: `${x(now)}%` }}>now</span>
          </div>
        </div>
      )}
      <Legend />
      {hover && <Tooltip p={hover.p} left={hover.left} top={hover.top} runs={runs} />}
    </div>
  )
}

function Bar({ p, x, color }: { p: Placed; x: (t: number) => number; color: string }) {
  const { step } = p
  const left = x(p.start!)
  if (step.kind === 'event') {
    return <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] ring-2 ring-surface" style={{ left: `${left}%`, background: color }} />
  }
  const width = x(p.end ?? p.start!) - left
  const problem = step.state === 'failed' || step.state === 'attention'
  const human = step.kind === 'human' || step.kind === 'review'
  const background = human
    ? `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 7px)`
    : color
  return (
    <span
      className={`absolute top-1/2 h-4 -translate-y-1/2 rounded ${human ? 'border' : ''} ${problem ? 'ring-2 ring-act' : step.state === 'retrying' ? 'ring-2 ring-watch' : ''} ${step.state === 'running' ? 'animate-pulse' : ''}`}
      style={{ left: `${left}%`, width: `max(${width}%, 6px)`, background, borderColor: human ? color : undefined }}
    />
  )
}

function Tooltip({ p, left, top, runs }: { p: Placed; left: number; top: number; runs: AgentRun[] }) {
  const { step } = p
  const runsHere = runs.filter((r) => r.step && STEP_OF_RUN[r.step] === step.key)
  const tokens = runsHere.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0)
  const cost = runsHere.reduce((n, r) => n + (r.costUsd ?? 0), 0)
  const failure = step.failure ? (step.kind === 'agent' ? classifyAgentFailure(step.failure).title : step.failure) : undefined
  return (
    <div className="pointer-events-none absolute z-20 w-64 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop"
      style={{ left: `min(${left + 12}px, calc(100% - 16.5rem))`, top: top + 14 }}>
      <p className="font-semibold text-ink">{step.label}</p>
      <p className="text-[11px] text-ink-muted">{KIND_LABEL[step.kind]} · {laneFor(step).label} · {step.state}</p>
      <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-ink-soft">
        <dt className="text-ink-muted">Started</dt><dd className="tabular-nums">{formatTime(new Date(p.start!).toISOString())}</dd>
        {step.kind !== 'event' && <><dt className="text-ink-muted">{step.endedAt ? 'Took' : 'So far'}</dt><dd className="tabular-nums">{formatDuration((p.end ?? p.start!) - p.start!)}</dd></>}
        {step.attempts > 1 && <><dt className="text-ink-muted">Attempts</dt><dd>{step.attempts}</dd></>}
        {runsHere.length > 0 && <><dt className="text-ink-muted">AI</dt><dd>{formatUsd(cost)} · {formatTokens(tokens)} tokens</dd></>}
      </dl>
      {step.kind === 'human' && step.state === 'waiting' && <p className="mt-1.5 text-[11px] text-ink-muted">Suspended in Temporal: no thread is held while it waits.</p>}
      {failure && <p className="mt-1.5 text-[11px] text-act-ink">{failure}</p>}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-[11px] text-ink-muted">
      {LANES.map((l) => (
        <span key={l.key} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} /> {l.label}</span>
      ))}
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm border border-ink-muted" style={{ background: 'repeating-linear-gradient(135deg, rgb(var(--ink-muted)) 0 2px, transparent 2px 5px)' }} /> Waiting on a person</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rotate-45 rounded-[1px] bg-ink-muted" /> Event</span>
    </div>
  )
}

/** The current time, ticking once a second while `live`. */
export function useNow(live: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!live) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [live])
  return now
}
