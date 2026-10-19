import { Fragment, useMemo, useState } from 'react'
import {
  Bell, BookOpen, CalendarClock, CheckCircle2, ChevronDown, Circle, Clock, FileSignature, FlaskConical, RotateCcw, Send, Siren, Sparkles, Target, TestTube2,
} from 'lucide-react'
import { api, type Assessment, type BiomarkerInsight, type BiomarkerPoint, type LabCatalog, type LabResultValue, type Level, type ResultsAnalysis } from '../lib/api'
import { formatDate, formatNumber, formatRange, formatTime } from '../lib/format'
import { BiomarkerChart } from './BiomarkerChart'
import { AgentFailureNote } from './AgentFailureNote'
import { AiBadge, Badge, Card, CardHeader, ErrorNote, Markdown, SeverityChip, Spinner, Tabs, TrendIcon, levelSeverity, type Severity } from './ui'

// The journey after the order: the lab visit and results, the unattended AI analysis, the physician's
// review and release, and the outcome.

const testName = (catalog: LabCatalog | undefined, code: string) => catalog?.orderableTests.find((t) => t.code === code)?.name ?? code
const levelBar: Record<Level, string> = { high: 'bg-act', moderate: 'bg-watch', low: 'bg-line' }

/** Order placed → patient notified → specimen collected → results back. */
export function OrderStatusPanel({ assessment, catalog }: { assessment: Assessment; catalog?: LabCatalog }) {
  const { data, stage } = assessment
  const order = data.labOrder
  const firstName = assessment.patientName.split(' ')[0]
  if (!order) {
    return <ProgressCard title="Placing the order" rows={[{ label: `Recording the order in ${assessment.ehrName} and sending it to Quest Diagnostics`, state: 'working' }]} />
  }
  const steps = [
    { label: 'Ordered', done: true, detail: `${order.tests.length} test${order.tests.length === 1 ? '' : 's'}` },
    { label: 'Patient notified', done: !!data.patientNotification, detail: data.patientNotification ? 'In the patient app' : 'Sending…' },
    { label: 'Specimen collected', done: !!data.labVisit, active: stage === 'AWAITING_PATIENT', detail: data.labVisit ? formatTime(data.labVisit.collectedAt) : 'Waiting on the patient' },
    { label: 'Results ready', done: !!data.labResults, active: stage === 'AWAITING_LAB', detail: data.labResults ? formatTime(data.labResults.issued) : stage === 'AWAITING_LAB' ? 'Lab processing' : '—' },
  ]
  const status = stage === 'AWAITING_PATIENT'
    ? { icon: Clock, text: `Waiting for ${firstName} to visit Quest Diagnostics for the blood draw.` }
    : stage === 'AWAITING_LAB'
      ? { icon: TestTube2, text: 'Specimen collected — Quest Diagnostics is processing it. Results return automatically.' }
      : data.labResults
        ? { icon: CheckCircle2, text: `Results received ${formatDate(data.labResults.issued)} and filed in ${assessment.ehrName}.` }
        : undefined

  return (
    <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader title="Lab visit & results" subtitle={`Order ${order.placerOrderId} · Quest Diagnostics`} icon={<FlaskConical size={16} />} />
        <div className="space-y-5 px-5 py-5">
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.label} className="relative">
                {i < steps.length - 1 && <span aria-hidden className={`absolute left-7 right-0 top-3 hidden h-0.5 sm:block ${s.done ? 'bg-brand' : 'bg-line'}`} />}
                <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full ${s.done ? 'bg-brand text-white dark:text-canvas' : s.active ? 'bg-watch-soft text-watch-ink ring-2 ring-watch' : 'border border-line bg-surface text-ink-muted'}`}>
                  {s.done ? <CheckCircle2 size={14} /> : s.active ? <Clock size={13} /> : <Circle size={8} />}
                </span>
                <p className={`mt-2 text-sm font-medium ${s.done || s.active ? 'text-ink' : 'text-ink-muted'}`}>{s.label}</p>
                <p className="text-xs text-ink-muted">{s.detail}</p>
              </li>
            ))}
          </ol>
          {status && (
            <p className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${data.labResults ? 'bg-good-soft text-good-ink' : 'bg-watch-soft/70 text-watch-ink'}`}>
              <status.icon size={16} className="mt-0.5 shrink-0" /> {status.text}
            </p>
          )}
          <div>
            <h3 className="eyebrow mb-2">Tests</h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {order.tests.map((code) => (
                <li key={code} className="flex items-center gap-2 rounded-lg bg-sunken/70 px-3 py-2 text-sm text-ink"><FlaskConical size={14} className="shrink-0 text-lab" /> {testName(catalog, code)}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {data.patientNotification && (
        <Card className="self-start">
          <CardHeader title="Message to the patient" subtitle="Shown in the patient app and filed in the EHR" icon={<Bell size={16} />} />
          <div className="space-y-3 px-5 py-4">
            <p className="text-sm leading-relaxed text-ink">{data.patientNotification.message}</p>
            {data.patientNotification.instructions.length > 0 && (
              <ul className="space-y-1 text-sm text-ink-soft">
                {data.patientNotification.instructions.map((i) => <li key={i} className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-good" /> {i}</li>)}
              </ul>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

function ProgressCard({ title, rows }: { title: string; rows: { label: string; state: 'done' | 'working' | 'pending' }[] }) {
  return (
    <Card>
      <div className="px-5 py-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Sparkles size={16} className="text-ai" /> {title}</p>
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-3 text-sm">
              {r.state === 'done' ? <CheckCircle2 size={18} className="text-good" /> : r.state === 'working' ? <Spinner size={18} className="text-ai" /> : <Circle size={18} className="text-line" />}
              <span className={r.state === 'pending' ? 'text-ink-muted' : 'text-ink'}>{r.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

const insightSeverity: Record<BiomarkerInsight['status'], Severity> = {
  optimal: 'good',
  normal: 'info',
  borderline: 'watch',
  'out-of-range': 'act',
}

type ReviewTab = 'overview' | 'risks' | 'results' | 'plan' | 'note' | 'patient'

/** Results arrive → analysis and care plan run unattended → physician reviews and releases. */
export function ReviewPanel({ assessment, catalog, onChanged }: { assessment: Assessment; catalog?: LabCatalog; onChanged: () => void }) {
  const { stage, data } = assessment
  const analysis = data.analysis
  const plan = data.carePlan
  const [tab, setTab] = useState<ReviewTab>('overview')
  const paused = Object.keys(assessment.openReviews ?? {}).length > 0
  const sections = useMemo(() => (analysis ? splitSections(analysis.updatedSummary) : []), [analysis])
  const urgent = sections.find((s) => /urgent/i.test(s.title))

  return (
    <div className="space-y-5">
      {!plan && !paused && (
        <ProgressCard title="AI is working on the results" rows={[
          { label: 'Comparing the new results with the patient’s history', state: analysis ? 'done' : 'working' },
          { label: 'Drafting the chart note, goals and patient report', state: analysis ? 'working' : 'pending' },
        ]} />
      )}
      {stage === 'AWAITING_REVIEW' && plan && assessment.openTasks.reviewAndRelease && <ReleaseForm assessment={assessment} onChanged={onChanged} />}

      {analysis && (
        <Card>
          <div className="px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ai-ink"><Sparkles size={13} /> Results analysis</p>
              <AiBadge label={stage === 'COMPLETED' ? 'AI draft · physician released' : 'AI draft · physician review required'} />
            </div>
            <h2 className="mt-3 max-w-4xl text-lg font-semibold leading-snug tracking-tight text-ink sm:text-xl">{analysis.headline}</h2>
            <Stats analysis={analysis} results={data.labResults?.results} followUps={plan?.followUpLabs.length} />
            {urgent && (
              <div className="mt-5 rounded-lg border border-act/25 bg-act-soft/60 px-4 py-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-act-ink"><Siren size={13} /> {urgent.title}</p>
                <div className="max-w-4xl"><Markdown>{linkCitations(urgent.body)}</Markdown></div>
              </div>
            )}
          </div>
          <Tabs<ReviewTab>
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'overview', label: 'Overview' },
              { key: 'risks', label: <>Risk flags <Count n={analysis.riskFlags.length} /></> },
              ...(data.labResults ? [{ key: 'results' as const, label: <>Lab results <Count n={data.labResults.results.length} /></> }] : []),
              ...(plan ? [
                { key: 'plan' as const, label: 'Care plan' },
                { key: 'note' as const, label: 'Chart note' },
                { key: 'patient' as const, label: 'Patient report' },
              ] : []),
            ]}
          />
          <div className="px-5 py-5 sm:px-6">
            {tab === 'overview' && <Overview analysis={analysis} sections={sections.filter((s) => s !== urgent)} />}
            {tab === 'risks' && <RiskFlags flags={analysis.riskFlags} />}
            {tab === 'results' && data.labResults && (
              <div className="space-y-6">
                <ResultsTable results={data.labResults.results} insights={analysis.biomarkerInsights} />
                <KeyTrends assessment={assessment} />
              </div>
            )}
            {tab === 'plan' && plan && <CarePlanView plan={plan} catalog={catalog} />}
            {tab === 'note' && plan && (
              <div className="max-w-3xl">
                <p className="mb-4 text-xs text-ink-muted">
                  {stage === 'COMPLETED' ? `Final — signed in ${assessment.ehrName}` : `Draft — filed in ${assessment.ehrName} as preliminary until you release it`}
                </p>
                <Markdown>{linkCitations(plan.physicianNote)}</Markdown>
              </div>
            )}
            {tab === 'patient' && plan && <PatientReportPreview plan={plan} released={stage === 'COMPLETED'} />}
          </div>
        </Card>
      )}
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-sunken px-1.5 text-[11px] tabular-nums text-ink-muted">{n}</span>
}

function Stats({ analysis, results, followUps }: { analysis: ResultsAnalysis; results?: LabResultValue[]; followUps?: number }) {
  const high = analysis.riskFlags.filter((f) => f.severity === 'high').length
  const moderate = analysis.riskFlags.filter((f) => f.severity === 'moderate').length
  const outOfRange = results ? results.filter((r) => r.interpretation === 'H' || r.interpretation === 'L').length : undefined
  const stats = [
    { label: 'High risk', value: high, tone: high ? 'text-act-ink' : 'text-ink' },
    { label: 'Moderate risk', value: moderate, tone: moderate ? 'text-watch-ink' : 'text-ink' },
    ...(outOfRange !== undefined ? [{ label: 'Results out of range', value: `${outOfRange} / ${results!.length}`, tone: outOfRange ? 'text-act-ink' : 'text-ink' }] : []),
    ...(followUps !== undefined ? [{ label: 'Follow-up tests', value: followUps, tone: 'text-ink' }] : []),
  ]
  return (
    <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg bg-sunken/70 px-3 py-2.5">
          <dt className="text-xs text-ink-muted">{s.label}</dt>
          <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${s.tone}`}>{s.value}</dd>
        </div>
      ))}
    </dl>
  )
}

const PMID = /\[?PMID:?\s*(\d{5,9})\]?/g

/** PubMed ids the agents cite, as links. */
function linkCitations(text: string): string {
  return text.replace(PMID, (_m, id: string) => `[PMID ${id}](https://pubmed.ncbi.nlm.nih.gov/${id}/)`)
}

/** The agent writes paragraphs that open with a bold label ("**Most urgent — …:**"); split them into sections. */
function splitSections(text: string): { title: string; body: string }[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^\*\*(.+?)\*\*\s*[:—–-]?\s*([\s\S]*)$/)
    return m ? { title: m[1].replace(/[:\s]+$/, ''), body: m[2] } : { title: '', body: p }
  })
}

function Overview({ analysis, sections }: { analysis: ResultsAnalysis; sections: { title: string; body: string }[] }) {
  const [allSteps, setAllSteps] = useState(false)
  const steps = analysis.suggestedNextSteps ?? []
  const citations = (analysis.updatedSummary.match(PMID) ?? []).length
  return (
    <div className="grid gap-8 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        {sections.map((s, i) => (
          <section key={s.title + i}>
            {s.title && <h3 className="mb-1.5 text-sm font-semibold text-ink">{s.title}</h3>}
            <Markdown>{linkCitations(s.body)}</Markdown>
          </section>
        ))}
        {citations > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-ink-muted"><BookOpen size={12} /> {citations} PubMed citation{citations === 1 ? '' : 's'}</p>
        )}
      </div>
      {steps.length > 0 && (
        <aside>
          <h3 className="eyebrow mb-3">Suggested next steps</h3>
          <ol className="space-y-3">
            {(allSteps ? steps : steps.slice(0, 4)).map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">{i + 1}</span>
                <p className="text-sm leading-relaxed text-ink">{s}</p>
              </li>
            ))}
          </ol>
          {steps.length > 4 && (
            <button type="button" onClick={() => setAllSteps(!allSteps)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline">
              {allSteps ? 'Show fewer' : `Show all ${steps.length}`} <ChevronDown size={13} className={`transition ${allSteps ? 'rotate-180' : ''}`} />
            </button>
          )}
          <p className="mt-4 text-xs text-ink-muted">For the physician to consider — not orders.</p>
        </aside>
      )}
    </div>
  )
}

function RiskFlags({ flags }: { flags: ResultsAnalysis['riskFlags'] }) {
  const [open, setOpen] = useState<string>()
  const order: Record<Level, number> = { high: 0, moderate: 1, low: 2 }
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {[...flags].sort((a, b) => order[a.severity] - order[b.severity]).map((f) => {
        const key = f.area + f.finding
        const isOpen = open === key
        return (
          <li key={key}>
            <button type="button" onClick={() => setOpen(isOpen ? undefined : key)} aria-expanded={isOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-sunken/60">
              <span className={`mt-1 h-9 w-1 shrink-0 rounded-full ${levelBar[f.severity]}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{f.area}</span>
                <span className="mt-0.5 block text-sm leading-snug text-ink-soft">{f.finding}</span>
              </span>
              <SeverityChip severity={levelSeverity(f.severity)} label={f.severity} />
              {f.evidence.length > 0 && <ChevronDown size={15} className={`mt-0.5 shrink-0 text-ink-muted transition ${isOpen ? 'rotate-180' : ''}`} />}
            </button>
            {isOpen && f.evidence.length > 0 && (
              <ul className="space-y-1 pb-3 pl-8 pr-4 text-xs text-ink-soft">
                {f.evidence.map((e) => <li key={e}>• {e}</li>)}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A step that ran out of retries (an EHR outage, an AI failure) waits for someone to retry or stop it.
 * Shown above every step, since any step can pause.
 */
export function OpenReviews({ assessment, onChanged }: { assessment: Assessment; onChanged: () => void }) {
  const tasks = Object.keys(assessment.openReviews ?? {})
  if (tasks.length === 0) return null
  const lastError = [...assessment.timeline].reverse().find((e) => e.status === 'error')
  const message = lastError?.detail ?? lastError?.title ?? 'A step could not complete.'
  return (
    <>
      {tasks.map((taskId) => (
        <div key={taskId} className="space-y-2">
          {lastError?.actor === 'agent' ? (
            <AgentFailureNote message={message} hint="Retry the step, or stop the assessment." />
          ) : (
            <ErrorNote message={`Paused after repeated failures: ${message.replace(/\.$/, "")}. Fix the cause, then retry.`} />
          )}
          <ReviewActions assessmentId={assessment.id} taskId={taskId} onChanged={onChanged} />
        </div>
      ))}
    </>
  )
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
    <div className="flex gap-2">
      <button type="button" className="btn-primary py-1.5 text-xs" disabled={!!busy} onClick={() => decide(true)}>
        {busy === 'retry' ? <Spinner size={13} /> : <RotateCcw size={13} />} Retry
      </button>
      <button type="button" className="btn-secondary py-1.5 text-xs" disabled={!!busy} onClick={() => decide(false)}>Stop assessment</button>
    </div>
  )
}

function ReleaseForm({ assessment, onChanged }: { assessment: Assessment; onChanged: () => void }) {
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  async function submit() {
    setBusy(true)
    setError(undefined)
    try {
      await api.release(assessment.id, comment)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <Card className="ring-1 ring-brand/30">
      <CardHeader
        title="Review and release"
        subtitle={`Review the analysis below. Releasing signs the chart note in ${assessment.ehrName}, closes the visit and shares the report with the patient.`}
        icon={<FileSignature size={16} />}
      />
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="comment">Comment (optional)</label>
          <input id="comment" className="field" value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="Added to the chart note and the patient's report" />
        </div>
        <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? <Spinner size={15} /> : <Send size={15} />} Release to patient
        </button>
      </div>
      {error && <div className="px-5 pb-4"><ErrorNote message={error} /></div>}
    </Card>
  )
}

function CarePlanView({ plan, catalog }: { plan: NonNullable<Assessment['data']['carePlan']>; catalog?: LabCatalog }) {
  return (
    <div className="grid gap-8 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div>
        <h3 className="eyebrow mb-3">Goals</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {plan.goals.map((g) => (
            <li key={g.title} className="rounded-lg border border-line px-4 py-3">
              <p className="flex items-start gap-2 text-sm font-medium text-ink"><Target size={15} className="mt-0.5 shrink-0 text-brand" /> {g.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{g.target}</p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                <Badge>{g.timeframe}</Badge>
                <Badge tone="brand" className="capitalize">{g.category}</Badge>
              </p>
            </li>
          ))}
        </ul>
      </div>
      {plan.followUpLabs.length > 0 && (
        <aside>
          <h3 className="eyebrow mb-3">Follow-up labs</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {plan.followUpLabs.map((f) => (
              <li key={f.testCode} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-sm text-ink"><FlaskConical size={14} className="shrink-0 text-lab" /> {testName(catalog, f.testCode)}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-ink-muted"><CalendarClock size={12} /> {f.timing}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  )
}

function PatientReportPreview({ plan, released }: { plan: NonNullable<Assessment['data']['carePlan']>; released: boolean }) {
  const report = plan.patientReport
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-xs text-ink-muted">{released ? 'Visible in the patient app' : 'The patient sees this only after you release it'}</p>
      <p className="text-lg font-semibold leading-snug text-ink">{report.headline}</p>
      <p className="text-sm leading-relaxed text-ink-soft">{report.whatWeFound}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {report.keyResults.map((r) => (
          <li key={r.name} className="rounded-lg border border-line px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-soft">{r.name}</span>
              <SeverityChip severity={r.status === 'good' ? 'good' : r.status === 'watch' ? 'watch' : 'act'} label={r.status === 'act' ? 'needs action' : r.status} />
            </div>
            <p className="mt-1 text-base font-semibold tabular-nums text-ink">{r.value}</p>
          </li>
        ))}
      </ul>
      {report.yourPlan.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">Your plan</h3>
          <ul className="space-y-2">
            {report.yourPlan.map((p) => (
              <li key={p.title} className="text-sm"><span className="font-medium text-ink">{p.title}.</span> <span className="text-ink-soft">{p.detail}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Released: what went back to the EHR and out to the patient. */
export function ConclusionPanel({ assessment, catalog }: { assessment: Assessment; catalog?: LabCatalog }) {
  const { data } = assessment
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-good/30 bg-good-soft/60 px-5 py-4">
        <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-good" />
        <div>
          <p className="font-semibold text-ink">Released to the patient</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            Note signed in {assessment.ehrName}, visit closed, report shared in the patient app.
            {data.release?.comment ? ` Your comment: “${data.release.comment}”` : ''}
          </p>
        </div>
      </div>
      <ReviewPanel assessment={assessment} catalog={catalog} onChanged={() => undefined} />
    </div>
  )
}

function ResultsTable({ results, insights }: { results: LabResultValue[]; insights?: BiomarkerInsight[] }) {
  const [open, setOpen] = useState<string>()
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-sunken/60 text-left text-xs text-ink-muted">
            <th className="px-4 py-2 font-medium">Test</th>
            <th className="px-3 py-2 text-right font-medium">Result</th>
            <th className="px-3 py-2 font-medium">Reference</th>
            <th className="px-3 py-2 font-medium">Reading</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const insight = insights?.find((i) => i.code === r.code)
            const flagged = r.interpretation === 'H' || r.interpretation === 'L'
            const isOpen = open === r.code
            return (
              <Fragment key={r.code}>
                <tr className={`border-b border-line last:border-0 ${insight ? 'cursor-pointer hover:bg-sunken/50' : ''}`} onClick={() => insight && setOpen(isOpen ? undefined : r.code)}>
                  <td className="px-4 py-2.5 font-medium text-ink">{r.name}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    <span className={`font-semibold ${flagged ? 'text-act-ink' : 'text-ink'}`}>{formatNumber(r.value)}</span>
                    <span className="ml-1 text-xs text-ink-muted">{r.unit}</span>
                    {flagged && <span className="ml-1 text-xs font-semibold text-act-ink">{r.interpretation}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-muted">{formatRange(r.referenceLow, r.referenceHigh)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {insight ? (
                      <span className="flex items-center gap-1.5">
                        <SeverityChip severity={insightSeverity[insight.status]} label={insight.status} />
                        <span className="flex items-center gap-0.5 text-xs text-ink-muted"><TrendIcon trend={insight.trend} /> {insight.trend}</span>
                      </span>
                    ) : <span className="text-xs text-ink-muted">—</span>}
                  </td>
                  <td className="pr-3 text-ink-muted">{insight && <ChevronDown size={14} className={`transition ${isOpen ? 'rotate-180' : ''}`} />}</td>
                </tr>
                {isOpen && insight && (
                  <tr className="border-b border-line bg-sunken/40 last:border-0">
                    <td colSpan={5} className="px-4 py-3 text-sm leading-relaxed text-ink-soft">{insight.interpretation}</td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** History + today's value for the analytes the EHR already tracked. */
function KeyTrends({ assessment }: { assessment: Assessment }) {
  const summary = assessment.data.summary
  const results = assessment.data.labResults?.results
  const series = useMemo(() => {
    if (!summary || !results) return []
    return summary.biomarkers
      .map((b) => {
        const today = results.find((r) => r.code === b.code)
        if (!today) return undefined
        const points: BiomarkerPoint[] = [...b.points, { date: today.effectiveDate, value: today.value, interpretation: today.interpretation, source: 'lab-today' }]
        return { ...b, points, referenceLow: today.referenceLow ?? b.referenceLow, referenceHigh: today.referenceHigh ?? b.referenceHigh }
      })
      .filter((b): b is NonNullable<typeof b> => !!b)
      .slice(0, 4)
  }, [summary, results])
  if (!series.length) return null
  return (
    <div>
      <h3 className="eyebrow mb-3">History · the filled dot is today’s result</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {series.map((s) => (
          <div key={s.code} className="rounded-lg border border-line p-4">
            <p className="text-sm font-medium text-ink">{s.name} <span className="text-xs font-normal text-ink-muted">{s.unit}</span></p>
            <BiomarkerChart points={s.points} unit={s.unit} referenceLow={s.referenceLow} referenceHigh={s.referenceHigh} height={130} highlightSource="lab-today" />
          </div>
        ))}
      </div>
    </div>
  )
}
