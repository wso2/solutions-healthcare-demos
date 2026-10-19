import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Check, ChevronDown, Copy, ExternalLink, ListChecks, RotateCcw, X } from 'lucide-react'
import { api, type AssessmentListItem, type Stage } from '../lib/api'
import { getProgress, markDemo, updateProgress, useDemoProgress } from '../lib/demoProgress'
import { parseTimestamp } from '../lib/format'
import { usePolling } from '../lib/usePolling'
import { useSystem } from '../lib/useSystem'

// The ten-minute demo (docs/agent-manager.md §6) as a checklist. Steps tick themselves from what the
// workflow reached, what the presenter opened and the budgets in force; any step can be ticked by hand.

const ORDER: Stage[] = ['STARTING', 'BUILDING_SUMMARY', 'AWAITING_PHYSICIAN', 'PLACING_LAB_ORDER', 'AWAITING_PATIENT', 'AWAITING_LAB',
  'ANALYZING_RESULTS', 'GENERATING_CARE_PLAN', 'AWAITING_REVIEW', 'COMPLETED']
const past = (stage: Stage | undefined, than: Stage) => !!stage && stage !== 'FAILED' && ORDER.indexOf(stage) > ORDER.indexOf(than)

interface Step {
  id: string
  title: string
  detail: string
  link?: { to: string; label: string; external?: boolean }
  command?: string
  optional?: boolean
}

export function PresenterGuide() {
  const [open, setOpen] = useState(false)
  const progress = useDemoProgress()
  const location = useLocation()
  const system = useSystem()
  const { data: assessments } = usePolling(() => api.assessments(), 4000, open)
  const { data: usage } = usePolling(() => api.usage().catch(() => undefined), 8000, open)

  // Visits that complete a step.
  useEffect(() => {
    if (location.pathname === '/agent-manager') markDemo('identity')
    if (location.search.includes('view=workflow')) markDemo('workflow')
  }, [location.pathname, location.search])

  const tracked: AssessmentListItem | undefined = useMemo(() => {
    const since = progress.since ?? 0
    return [...(assessments ?? [])]
      .filter((a) => parseTimestamp(a.createdAt).getTime() >= since)
      .sort((a, b) => parseTimestamp(b.createdAt).getTime() - parseTimestamp(a.createdAt).getTime())[0]
  }, [assessments, progress.since])

  const exhausted = Object.values(usage?.agents ?? {}).some((a) => a.budget?.exhausted)
  useEffect(() => {
    if (exhausted && !getProgress().sawExhausted) updateProgress((p) => ({ ...p, sawExhausted: true }))
  }, [exhausted])

  const steps: Step[] = [
    { id: 'identity', title: 'Show each agent’s identity and permissions', detail: 'Try “Read the Cerner EHR” as the Copilot (allowed), then as Care Plan (refused by Agent Manager).', link: { to: '/agent-manager', label: 'Agent Manager' } },
    { id: 'fhir', title: 'Show FHIR de-identification', detail: 'Try it: one Patient from the FHIR server next to what the Copilot receives through the MCP proxy.', link: { to: '/agent-manager#fhir', label: 'De-identification' } },
    { id: 'start', title: 'Start an assessment', detail: 'Physician → Sofia Alvarez → start a longevity assessment.', link: { to: '/physician?ehr=athena', label: 'Physician' } },
    { id: 'evaluate', title: 'Evaluate with the Copilot and order labs', detail: 'Select records in the explorer, ask for the AI overview, then order the proposed tests.' },
    { id: 'workflow', title: 'Follow it on the Workflow tab', detail: 'Every stage live from Temporal, with tokens and cost on the AI steps.' },
    { id: 'visit', title: 'Patient visits the lab', detail: 'Lab console → “Patient arrived · collect specimen”.', link: { to: '/lab', label: 'Lab console' } },
    { id: 'outage', title: 'Cut the EHR network', detail: 'Workflow tab → Simulate failures: the step retries, then asks operations to retry or stop.', optional: true },
    { id: 'budget', title: 'Exhaust the Care Plan agent’s budget', detail: 'Its next model call is refused by Agent Manager (429).', command: './scripts/amp-budgets.sh --exhaust care-planner' },
    { id: 'release-lab', title: 'Release the lab results', detail: 'Lab console → “Release results”. Analysis runs; the Care Plan step retries, then waits for operations.', link: { to: '/lab', label: 'Lab console' } },
    { id: 'restore', title: 'Restore the budget and retry', detail: 'Then press Retry on the workflow’s paused step.', command: './scripts/amp-budgets.sh' },
    { id: 'review', title: 'Review and release to the patient', detail: 'The note becomes final in the EHR and the patient app shows the report.' },
    { id: 'console', title: 'Traces and evaluations in the console', detail: 'Agent → Traces (LLM and MCP tool calls), then Monitors (scores per evaluator).',
      link: system?.agentManager.consoleUrl ? { to: system.agentManager.consoleUrl, label: 'Console', external: true } : undefined },
  ]

  const stage = tracked?.stage
  const auto: Record<string, boolean> = {
    start: !!tracked,
    evaluate: past(stage, 'AWAITING_PHYSICIAN'),
    visit: past(stage, 'AWAITING_PATIENT'),
    budget: exhausted || !!progress.sawExhausted,
    'release-lab': past(stage, 'AWAITING_LAB'),
    restore: !!progress.sawExhausted && !exhausted,
    review: stage === 'COMPLETED',
  }
  const isDone = (id: string) => progress.done.includes(id) || !!auto[id]
  const required = steps.filter((s) => !s.optional)
  const count = required.filter((s) => isDone(s.id)).length
  const next = steps.find((s) => !s.optional && !isDone(s.id))

  const toggle = (id: string) => updateProgress((p) => ({ ...p, done: p.done.includes(id) ? p.done.filter((d) => d !== id) : [...p.done, id] }))
  const startOver = () => updateProgress(() => ({ done: [], since: Date.now(), sawExhausted: false }))

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-pop hover:bg-sunken"
        aria-expanded={open}
      >
        <ListChecks size={16} className="text-brand-ink" /> Demo guide <span className="tabular-nums text-ink-muted">{count}/{required.length}</span>
        <ChevronDown size={14} className={`text-ink-muted transition ${open ? '' : 'rotate-180'}`} />
      </button>
      {open && (
        <section className="card fixed bottom-16 left-4 right-4 z-40 flex max-h-[72vh] flex-col shadow-pop sm:left-auto sm:w-[380px]" aria-label="Demo guide">
          <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">Ten-minute demo</h2>
              <p className="truncate text-xs text-ink-muted">
                {tracked ? <>Following <Link className="font-mono text-brand-ink hover:underline" to={`/physician/assessments/${tracked.id}`}>{tracked.id}</Link> · {tracked.patientName}</> : 'No assessment yet in this run-through'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={startOver} title="Clear the ticks and follow only assessments started from now"><RotateCcw size={13} /> Start over</button>
              <button type="button" className="btn-ghost px-2 py-1" onClick={() => setOpen(false)} aria-label="Close the demo guide"><X size={15} /></button>
            </div>
          </header>
          <ol className="flex-1 divide-y divide-line overflow-y-auto">
            {steps.map((s, i) => {
              const done = isDone(s.id)
              const current = next?.id === s.id
              return (
                <li key={s.id} className={`flex gap-3 px-4 py-2.5 ${current ? 'bg-brand-soft/50' : ''}`}>
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    disabled={!!auto[s.id]}
                    aria-label={done ? `Mark “${s.title}” not done` : `Mark “${s.title}” done`}
                    title={auto[s.id] ? 'Ticked from what the demo reached' : undefined}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${done ? 'border-brand bg-brand text-white dark:text-canvas' : current ? 'border-brand text-brand-ink' : 'border-line text-ink-muted'}`}
                  >
                    {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${done ? 'text-ink-muted line-through decoration-ink-muted/40' : 'text-ink'}`}>
                      {s.title}{s.optional && <span className="ml-1.5 text-[11px] font-normal text-ink-muted no-underline">optional</span>}
                    </p>
                    {!done && <p className="mt-0.5 text-xs leading-snug text-ink-soft">{s.detail}</p>}
                    {!done && (s.link || s.command) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {s.link && (s.link.external
                          ? <a className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline" href={s.link.to} target="_blank" rel="noreferrer">{s.link.label} <ExternalLink size={11} /></a>
                          : <Link className="text-xs font-medium text-brand-ink hover:underline" to={s.link.to}>{s.link.label} →</Link>)}
                        {s.command && <CommandChip command={s.command} />}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </>
  )
}

function CommandChip({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable: the command is visible to type */
    }
  }
  return (
    <button type="button" onClick={copy} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-sunken px-2 py-0.5 font-mono text-[11px] text-ink-soft hover:text-ink" title="Copy the command">
      <span className="truncate">{command}</span>
      {copied ? <Check size={11} className="shrink-0 text-good-ink" /> : <Copy size={11} className="shrink-0" />}
    </button>
  )
}
