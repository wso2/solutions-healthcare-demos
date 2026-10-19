import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3, Bell, BookOpen, CheckCircle2, ClipboardCheck, ExternalLink, FileSignature, FlaskConical, GitBranch, Send, Siren, Target, TestTube2,
  TriangleAlert, UserRound,
} from 'lucide-react'
import { api, type AgentRun, type Assessment, type BiomarkerInsight, type BiomarkerPoint, type LabCatalog, type LabResultValue } from '../lib/api'
import { formatDate, formatNumber, formatRange, formatTime } from '../lib/format'
import { BiomarkerChart } from './BiomarkerChart'
import { AgentFailureNote, AgentReceipt, useAssessmentRuns } from './governance'
import { AiBadge, Badge, Card, CardHeader, ErrorNote, Markdown, SeverityChip, Spinner, TrendIcon, Working, levelSeverity, type Severity } from './ui'

// The journey after the order: the patient's lab visit, lab processing, the unattended AI analysis,
// the physician's review and release, and the outcome.

const testName = (catalog: LabCatalog | undefined, code: string) => catalog?.orderableTests.find((t) => t.code === code)?.name ?? code

/** Order placed → waiting on the patient → waiting on the lab. */
export function OrderStatusPanel({ assessment, catalog }: { assessment: Assessment; catalog?: LabCatalog }) {
  const { data, stage } = assessment
  const order = data.labOrder
  if (!order) return <Working title="Placing the order" detail={`Order of record in ${assessment.ehrName}, patient matched in the lab by MRN, order sent to Quest.`} />
  const steps = [
    { key: 'ordered', label: 'Ordered', done: true, detail: `${order.tests.length} tests · ${order.placerOrderId}` },
    { key: 'notified', label: 'Patient notified', done: !!data.patientNotification, detail: data.patientNotification ? `Communication/${data.patientNotification.communicationId.slice(0, 8)}` : 'Sending…' },
    { key: 'visit', label: 'Lab visit', done: !!data.labVisit, active: stage === 'AWAITING_PATIENT', detail: data.labVisit ? `Collected ${formatTime(data.labVisit.collectedAt)}` : 'Waiting on the patient' },
    { key: 'processing', label: 'Processing', done: !!data.labResults, active: stage === 'AWAITING_LAB', detail: stage === 'AWAITING_LAB' ? 'Waiting on the lab' : data.labResults ? 'Resulted' : '—' },
  ]
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Lab order in progress" subtitle={`Order of record ServiceRequest/${order.ehrServiceRequestId.slice(0, 8)} in ${assessment.ehrName} · Quest ServiceRequest/${order.labServiceRequestId.slice(0, 8)}`} icon={<FlaskConical size={16} />} />
        <ol className="grid gap-3 px-5 py-5 sm:grid-cols-4">
          {steps.map((s) => (
            <li key={s.key} className={`rounded-xl border px-3 py-3 ${s.active ? 'border-watch/50 bg-watch-soft/60' : s.done ? 'border-line bg-surface' : 'border-dashed border-line bg-sunken/40'}`}>
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                {s.done ? <CheckCircle2 size={15} className="text-good" /> : s.active ? <Spinner size={14} className="text-watch-ink" /> : <span className="h-3.5 w-3.5 rounded-full border border-line" />}
                {s.label}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{s.detail}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-1.5 border-t border-line px-5 py-3">
          {order.tests.map((code) => <Badge key={code} className="!whitespace-normal">{testName(catalog, code)}</Badge>)}
        </div>
      </Card>

      {data.patientNotification && (
        <Card>
          <CardHeader title="What the patient was told" subtitle="Filed in the EHR as a FHIR Communication, shown in the patient app" icon={<Bell size={16} />} />
          <div className="space-y-3 px-5 py-4">
            <p className="text-sm leading-relaxed text-ink">{data.patientNotification.message}</p>
            <div className="flex flex-wrap gap-2">
              <Link to={`/patient/${assessment.ehr}/${assessment.patientId}`} className="btn-secondary py-1.5 text-xs"><UserRound size={14} /> Open the patient app</Link>
              <Link to="/lab" className="btn-secondary py-1.5 text-xs"><TestTube2 size={14} /> Open the lab console</Link>
            </div>
          </div>
        </Card>
      )}

      {stage === 'AWAITING_PATIENT' && (
        <Working title="Waiting on the patient — a human task in the workflow" detail="The workflow is suspended and holds no thread. When the patient arrives and the lab collects the specimen (lab console → “Collect specimen”), the lab completes the task." />
      )}
      {stage === 'AWAITING_LAB' && (
        <Working title="Specimen collected — waiting on the lab" detail="Release results from the lab console. The lab notifies the integration by webhook; a fallback poller covers a missed notification." />
      )}
    </div>
  )
}

const insightSeverity: Record<BiomarkerInsight['status'], Severity> = {
  optimal: 'good',
  normal: 'info',
  borderline: 'watch',
  'out-of-range': 'act',
}

/** Results arrive → analysis and care plan run unattended → physician reviews and releases. */
export function ReviewPanel({ assessment, catalog, onChanged }: { assessment: Assessment; catalog?: LabCatalog; onChanged: () => void }) {
  const { stage, data } = assessment
  const analysis = data.analysis
  const plan = data.carePlan
  const agentsActive = stage === 'ANALYZING_RESULTS' || stage === 'GENERATING_CARE_PLAN' || stage === 'AWAITING_REVIEW'
  const runs = useAssessmentRuns(assessment.id, agentsActive)
  // An agent step that ran out of retries waits for operations; say so here, not only on the Workflow tab.
  const review = Object.keys(assessment.openReviews ?? {}).length > 0
  const agentError = review ? [...assessment.timeline].reverse().find((e) => e.actor === 'agent' && e.status === 'error') : undefined
  return (
    <div className="space-y-5">
      {review && (
        <div className="space-y-2">
          <AgentFailureNote message={agentError?.detail ?? agentError?.title ?? 'An AI agent could not complete its step.'}
            hint="The workflow has paused for operations to retry or stop it." />
          <Link to="?view=workflow" className="btn-secondary py-1.5 text-xs"><GitBranch size={14} /> Retry or stop on the Workflow tab</Link>
        </div>
      )}
      {!analysis && !review && <Working title="Results Analysis is comparing the results with the EHR history" detail="Results are filed in the EHR first. The Care Plan agent runs straight after — no clicks needed." />}
      {analysis && !plan && !review && <Working title="Care Plan agent is drafting the chart note and the patient report" detail="Then the draft note is filed in the EHR as preliminary and the workflow waits for your review." />}
      {stage === 'AWAITING_REVIEW' && plan && assessment.openTasks.reviewAndRelease && <ReleaseForm assessment={assessment} onChanged={onChanged} />}
      {analysis && (
        <Card>
          <CardHeader title="Results analysis" icon={<BarChart3 size={16} />} action={<AiBadge label={stage === 'COMPLETED' ? 'AI draft · physician released' : undefined} />} />
          <div className="space-y-4 px-5 py-4">
            <p className="text-base font-semibold leading-snug text-ink">{analysis.headline}</p>
            <AnalysisSummary text={analysis.updatedSummary} />
          </div>
          <AgentReceipt step="analysis" runs={runs} />
        </Card>
      )}
      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-5">
        <div className="space-y-5 xl:col-span-3">
          {data.labResults && <ResultsTable results={data.labResults.results} insights={analysis?.biomarkerInsights} issued={data.labResults.issued} />}
          <KeyTrends assessment={assessment} />
        </div>
        <div className="space-y-5 xl:col-span-2">
          {analysis && (
            <Card>
              <CardHeader title="Risk flags" icon={<TriangleAlert size={16} />} action={<AiBadge label="AI" />} />
              <ul className="divide-y divide-line">
                {analysis.riskFlags.map((flag) => (
                  <li key={flag.area + flag.finding} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{flag.area}</p>
                      <SeverityChip severity={levelSeverity(flag.severity)} label={flag.severity} />
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">{flag.finding}</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1">
                      {flag.evidence.slice(0, 4).map((e) => <li key={e} className="rounded bg-sunken px-1.5 py-0.5 text-[11px] text-ink-muted">{e}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {analysis && (analysis.suggestedNextSteps?.length ?? 0) > 0 && (
            <Card>
              <CardHeader title="Suggested next steps" subtitle="For the physician to consider — not orders" />
              <ul className="space-y-2 px-5 py-4 text-sm text-ink">
                {(analysis.suggestedNextSteps ?? []).map((s) => <li key={s} className="leading-snug">• {s}</li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
      {plan && <CarePlanDraft assessment={assessment} catalog={catalog} runs={runs} />}
    </div>
  )
}

const PMID = /\[?PMID:?\s*(\d{5,9})\]?/g

/** PubMed ids the agents cite, as links (the agents find them with the PubMed MCP server). */
function linkCitations(text: string): string {
  return text.replace(PMID, (_m, id: string) => `[PMID ${id}](https://pubmed.ncbi.nlm.nih.gov/${id}/)`)
}

/**
 * The analysis as sections: the agent writes paragraphs that open with a bold label ("**Most urgent — …:**").
 * The most urgent one becomes a callout, the rest a grid; anything else stays as written.
 */
function AnalysisSummary({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const sections = paragraphs.map((p) => {
    const m = p.match(/^\*\*(.+?)\*\*\s*[:—–-]?\s*([\s\S]*)$/)
    return m ? { title: m[1].replace(/[:\s]+$/, ''), body: m[2] } : { title: '', body: p }
  })
  const citations = (text.match(PMID) ?? []).length
  if (sections.filter((s) => s.title).length < 2) {
    return <Markdown>{linkCitations(text)}</Markdown>
  }
  const urgent = sections.find((s) => /urgent/i.test(s.title))
  const rest = sections.filter((s) => s !== urgent)
  return (
    <div className="space-y-3">
      {urgent && (
        <div className="rounded-lg border border-act/25 bg-act-soft/60 px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-act-ink"><Siren size={13} /> {urgent.title}</p>
          <Markdown>{linkCitations(urgent.body)}</Markdown>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {rest.map((s, i) => (
          <div key={s.title + i} className={`rounded-lg border border-line px-4 py-3 ${s.title ? '' : 'md:col-span-2'}`}>
            {s.title && <p className="eyebrow mb-1">{s.title}</p>}
            <Markdown>{linkCitations(s.body)}</Markdown>
          </div>
        ))}
      </div>
      {citations > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <BookOpen size={12} /> {citations} PubMed citation{citations === 1 ? '' : 's'}, found by the agent with the PubMed MCP server
        </p>
      )}
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
        subtitle="Completes the workflow's review task: the note becomes final in the EHR, the visit closes, and the patient sees the report"
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

function CarePlanDraft({ assessment, catalog, runs }: { assessment: Assessment; catalog?: LabCatalog; runs: AgentRun[] }) {
  const plan = assessment.data.carePlan!
  const released = assessment.stage === 'COMPLETED'
  return (
    <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-2">
      <Card>
        <CardHeader
          title={released ? 'Chart note (final)' : 'Chart note (draft)'}
          subtitle={`${assessment.ehrName} DocumentReference/${assessment.data.draftNote?.noteId.slice(0, 8) ?? '…'} · ${released ? 'final' : 'preliminary until released'}`}
          icon={<ClipboardCheck size={16} />}
          action={<AiBadge label={released ? 'AI draft · physician released' : undefined} />}
        />
        <div className="max-h-[520px] overflow-y-auto px-5 py-4"><Markdown>{linkCitations(plan.physicianNote)}</Markdown></div>
        <AgentReceipt step="care-plan" runs={runs} />
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Goals & follow-up" icon={<Target size={16} />} />
          <ul className="divide-y divide-line">
            {plan.goals.map((g) => (
              <li key={g.title} className="px-5 py-2.5">
                <p className="text-sm font-medium text-ink">{g.title}</p>
                <p className="text-xs text-ink-muted">{g.target} · {g.timeframe} · {g.category}</p>
              </li>
            ))}
          </ul>
          {plan.followUpLabs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-line px-5 py-3">
              {plan.followUpLabs.map((f) => <Badge key={f.testCode} className="!whitespace-normal">{testName(catalog, f.testCode)} · {f.timing}</Badge>)}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Patient report preview" subtitle={released ? 'Visible in the patient app' : 'The patient sees this only after you release it'} icon={<UserRound size={16} />} />
          <div className="space-y-3 px-5 py-4">
            <p className="font-semibold text-ink">{plan.patientReport.headline}</p>
            <p className="text-sm leading-relaxed text-ink-soft">{plan.patientReport.whatWeFound}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {plan.patientReport.keyResults.map((r) => (
                <li key={r.name} className="rounded-lg border border-line px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink">{r.name}</span>
                    <SeverityChip severity={r.status === 'good' ? 'good' : r.status === 'watch' ? 'watch' : 'act'} label={r.status} />
                  </div>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{r.value}</p>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  )
}

/** Released: what went back to the EHR and out to the patient. */
export function ConclusionPanel({ assessment, catalog }: { assessment: Assessment; catalog?: LabCatalog }) {
  const { data } = assessment
  return (
    <div className="space-y-5">
      <Card className="border-good/30">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-good" />
            <div>
              <p className="font-semibold text-ink">Released to the patient</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                Note signed in {assessment.ehrName}, visit closed, Longevity Record published.
                {data.release?.comment ? ` Your comment: “${data.release.comment}”` : ''}
              </p>
            </div>
          </div>
          <Link to={`/patient/${assessment.ehr}/${assessment.patientId}`} className="btn-secondary shrink-0">
            <UserRound size={15} /> Patient app <ExternalLink size={13} />
          </Link>
        </div>
      </Card>
      <ReviewPanel assessment={assessment} catalog={catalog} onChanged={() => undefined} />
    </div>
  )
}

function ResultsTable({ results, insights, issued }: { results: LabResultValue[]; insights?: BiomarkerInsight[]; issued?: string }) {
  return (
    <Card>
      <CardHeader title="Lab results" subtitle={issued ? `Issued ${formatDate(issued)} · filed in the EHR` : 'From the lab'} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="px-5 py-2 font-medium">Test</th>
              <th className="px-3 py-2 text-right font-medium">Result</th>
              <th className="px-3 py-2 font-medium">Reference</th>
              <th className="px-3 py-2 font-medium">Reading</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const insight = insights?.find((i) => i.code === r.code)
              const flagged = r.interpretation === 'H' || r.interpretation === 'L'
              return (
                <tr key={r.code} className="border-b border-line align-top last:border-0">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-ink">{r.name}</p>
                    {insight && <Interpretation text={insight.interpretation} />}
                  </td>
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
                        <span className="text-ink-muted" title={insight.trend}><TrendIcon trend={insight.trend} /></span>
                      </span>
                    ) : <span className="text-xs text-ink-muted">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/** The agent's reading of one result: three lines, the rest on click. */
function Interpretation({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
      className={`mt-0.5 block max-w-md text-left text-xs leading-snug text-ink-muted hover:text-ink-soft ${open ? '' : 'line-clamp-3'}`}>
      {text}
    </button>
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
      <h3 className="eyebrow mb-3">History + today · filled dot is today's result</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {series.map((s) => (
          <div key={s.code} className="card p-4">
            <p className="text-sm font-medium text-ink">{s.name} <span className="text-xs font-normal text-ink-muted">{s.unit}</span></p>
            <BiomarkerChart points={s.points} unit={s.unit} referenceLow={s.referenceLow} referenceHigh={s.referenceHigh} height={130} highlightSource="lab-today" />
          </div>
        ))}
      </div>
    </div>
  )
}
