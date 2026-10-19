import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CheckSquare, ChevronDown, FlaskConical, RefreshCw, Sparkles, Square } from 'lucide-react'
import { api, type Assessment, type CopilotEvaluation, type LabCatalog, type Level } from '../lib/api'
import { isCopilotFailure } from '../lib/agentErrors'
import { AgentFailureNote } from './AgentFailureNote'
import { Explorer } from './Explorer'
import { AiBadge, Badge, Card, CardHeader, ErrorNote, Expandable, Markdown, SeverityChip, Spinner, Working, levelSeverity } from './ui'

// "Evaluate & order": the physician selects records, the AI evaluates them and proposes a panel, and the
// physician orders — which completes the workflow's "evaluate and order labs" task.

const priorityTone = { essential: 'act', recommended: 'brand', optional: 'neutral' } as const
const levelBar: Record<Level, string> = { high: 'bg-act', moderate: 'bg-watch', low: 'bg-line' }

// The AI evaluation is hidden from the UI for now: the physician reviews the record and orders from the lab
// catalog. Set to true to bring back "Evaluate with AI" and the AI evaluation card.
const SHOW_AI_EVALUATION = false

export function EvaluateStep(props: { assessment: Assessment; catalog?: LabCatalog; onChanged: () => void }) {
  return SHOW_AI_EVALUATION ? <AiEvaluateStep {...props} /> : <OrderStep {...props} />
}

/** Review the record, order from the lab catalog. */
function OrderStep({ assessment, catalog, onChanged }: { assessment: Assessment; catalog?: LabCatalog; onChanged: () => void }) {
  const canOrder = assessment.stage === 'AWAITING_PHYSICIAN' && !!assessment.openTasks.orderLabs
  if (assessment.stage === 'PLACING_LAB_ORDER') {
    return <Working title="Placing the order" detail={`Recording the order in ${assessment.ehrName} and sending it to Quest Diagnostics.`} />
  }
  if (!canOrder) return <OrderedTests assessment={assessment} catalog={catalog} />
  return (
    <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Explorer ehr={assessment.ehr} ehrName={assessment.ehrName} patientId={assessment.patientId} />
      <div className="xl:sticky xl:top-20 xl:self-start">
        <OrderForm assessment={assessment} catalog={catalog} onChanged={onChanged} />
      </div>
    </div>
  )
}

function AiEvaluateStep({ assessment, catalog, onChanged }: { assessment: Assessment; catalog?: LabCatalog; onChanged: () => void }) {
  const { data } = assessment
  const evaluation = data.evaluation
  const running = data.copilot?.status === 'running'
  const canOrder = assessment.stage === 'AWAITING_PHYSICIAN' && !!assessment.openTasks.orderLabs
  const [showRecords, setShowRecords] = useState(!evaluation)
  const [orderWithoutAi, setOrderWithoutAi] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const failure = data.copilot?.status === 'failed'
    ? [...(data.copilot.messages ?? [])].reverse().find((m) => m.role === 'copilot' && isCopilotFailure(m.text))?.text
    : undefined

  // A new evaluation replaces the record selection on screen.
  useEffect(() => {
    if (evaluation) setShowRecords(false)
  }, [evaluation?.overview]) // eslint-disable-line react-hooks/exhaustive-deps

  if (assessment.stage === 'PLACING_LAB_ORDER') {
    return <Working title="Placing the order" detail={`Recording the order in ${assessment.ehrName} and sending it to Quest Diagnostics.`} />
  }

  return (
    <div className="space-y-5">
      {canOrder && (showRecords || !evaluation) && !running && (
        <Explorer
          ehr={assessment.ehr}
          ehrName={assessment.ehrName}
          patientId={assessment.patientId}
          evaluating={evaluating}
          onEvaluate={async ({ rows, question, dateFrom, dateTo }) => {
            setEvaluating(true)
            try {
              await api.evaluate(assessment.id, rows, question, dateFrom, dateTo)
              onChanged()
            } finally {
              setEvaluating(false)
            }
          }}
        />
      )}
      {running && (
        <Working title="AI is evaluating the selected records" detail="Reading the history, checking the literature and matching tests to the lab catalog. This usually takes a minute or two." />
      )}
      {failure && !running && <AgentFailureNote message={failure} hint="Select the records and evaluate again." />}

      {evaluation && !running && (
        <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_420px]">
          <EvaluationView
            evaluation={evaluation}
            action={canOrder && !showRecords ? (
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowRecords(true)}>
                <RefreshCw size={13} /> Re-evaluate
              </button>
            ) : undefined}
          />
          <div className="xl:sticky xl:top-20 xl:self-start">
            {canOrder ? <OrderForm assessment={assessment} evaluation={evaluation} catalog={catalog} onChanged={onChanged} /> : <OrderedTests assessment={assessment} catalog={catalog} />}
          </div>
        </div>
      )}

      {!evaluation && !running && canOrder && (
        orderWithoutAi
          ? <OrderForm assessment={assessment} catalog={catalog} onChanged={onChanged} />
          : <button type="button" className="text-xs font-medium text-brand-ink hover:underline" onClick={() => setOrderWithoutAi(true)}>Order from the lab catalog without an AI evaluation</button>
      )}
      {!evaluation && !canOrder && data.labOrder && <OrderedTests assessment={assessment} catalog={catalog} />}
    </div>
  )
}

function EvaluationView({ evaluation, action }: { evaluation: CopilotEvaluation; action?: React.ReactNode }) {
  const [openFinding, setOpenFinding] = useState<string>()
  const [showQuestions, setShowQuestions] = useState(false)
  return (
    <Card>
      <CardHeader title="AI evaluation" subtitle="Overview of the selected records" icon={<Sparkles size={16} className="text-ai" />}
        action={<div className="flex items-center gap-2">{action}<AiBadge label="AI draft" /></div>} />
      <div className="space-y-6 px-5 py-5">
        <Expandable collapsedHeight={132}>
          <div className="max-w-3xl"><Markdown>{evaluation.overview}</Markdown></div>
        </Expandable>

        {evaluation.keyFindings.length > 0 && (
          <div>
            <h3 className="eyebrow mb-2">Key findings</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {evaluation.keyFindings.map((f) => {
                const open = openFinding === f.finding
                return (
                  <li key={f.finding}>
                    <button type="button" onClick={() => setOpenFinding(open ? undefined : f.finding)} aria-expanded={open}
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-sunken/60">
                      <span className={`mt-1 h-4 w-1 shrink-0 rounded-full ${levelBar[f.significance]}`} aria-hidden />
                      <span className="min-w-0 flex-1 text-sm leading-snug text-ink">{f.finding}</span>
                      <SeverityChip severity={levelSeverity(f.significance)} label={f.significance} />
                      {f.evidence.length > 0 && <ChevronDown size={14} className={`mt-0.5 shrink-0 text-ink-muted transition ${open ? 'rotate-180' : ''}`} />}
                    </button>
                    {open && f.evidence.length > 0 && (
                      <ul className="space-y-1 px-7 pb-3 text-xs text-ink-soft">
                        {f.evidence.map((e) => <li key={e}>• {e}</li>)}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {evaluation.riskHypotheses.length > 0 && (
          <div>
            <h3 className="eyebrow mb-2">Risk areas</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {evaluation.riskHypotheses.map((h) => (
                <li key={h.area} className="rounded-lg bg-sunken/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink first-letter:uppercase">{h.area}</p>
                    <SeverityChip severity={levelSeverity(h.likelihood)} label={h.likelihood} />
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-ink-soft" title={h.rationale}>{h.rationale}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {evaluation.questionsForPatient.length > 0 && (
          <div className="border-t border-line pt-4">
            <button type="button" onClick={() => setShowQuestions(!showQuestions)} aria-expanded={showQuestions} className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
              Questions to ask the patient ({evaluation.questionsForPatient.length})
              <ChevronDown size={14} className={`transition ${showQuestions ? 'rotate-180' : ''}`} />
            </button>
            {showQuestions && (
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {evaluation.questionsForPatient.map((q) => <li key={q}>• {q}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

const testNameOf = (catalog: LabCatalog | undefined, code: string) => catalog?.orderableTests.find((t) => t.code === code)?.name ?? code

/** After the order: what was ordered. */
function OrderedTests({ assessment, catalog }: { assessment: Assessment; catalog?: LabCatalog }) {
  const order = assessment.data.labOrder
  if (!order) return null
  return (
    <Card>
      <CardHeader title="Labs ordered" subtitle={`Sent to ${assessment.ehrName} and Quest Diagnostics`} icon={<CheckCircle2 size={16} className="text-good" />} />
      <ul className="space-y-1.5 px-5 py-4">
        {order.tests.map((code) => (
          <li key={code} className="flex items-center gap-2 text-sm text-ink"><FlaskConical size={14} className="text-lab" /> {testNameOf(catalog, code)}</li>
        ))}
      </ul>
      {assessment.data.labOrderApproval?.clinicalContext && (
        <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-muted">{assessment.data.labOrderApproval.clinicalContext}</p>
      )}
    </Card>
  )
}

function OrderForm({ assessment, evaluation, catalog, onChanged }: {
  assessment: Assessment
  evaluation?: CopilotEvaluation
  catalog?: LabCatalog
  onChanged: () => void
}) {
  const proposed = useMemo(() => evaluation?.recommendedTests ?? [], [evaluation])
  const [checked, setChecked] = useState<string[]>([])
  const [context, setContext] = useState('')
  const [note, setNote] = useState('Fasting draw.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [showCatalog, setShowCatalog] = useState(!evaluation)
  const [showDetails, setShowDetails] = useState(false)

  // Follow the AI's latest proposal (essential + recommended), until the physician edits it.
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (touched) return
    setChecked(proposed.filter((t) => t.priority !== 'optional').map((t) => t.testCode))
    if (evaluation) setContext(evaluation.reply)
  }, [proposed, evaluation, touched])

  const toggle = (code: string) => {
    setTouched(true)
    setChecked((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]))
  }
  const others = (catalog?.orderableTests ?? []).filter((t) => !proposed.some((p) => p.testCode === t.code))

  async function submit() {
    setBusy(true)
    setError(undefined)
    try {
      await api.orderLabs(assessment.id, { approvedTests: checked, note, clinicalContext: context })
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Card className="ring-1 ring-brand/30">
      <CardHeader title="Order labs" subtitle={proposed.length ? 'Proposed by the AI — adjust before ordering' : 'Choose from the lab catalog'} icon={<FlaskConical size={16} />} />
      <div className="space-y-4 px-5 py-4">
        {proposed.length > 0 && (
          <ul className="-mx-2 space-y-0.5">
            {proposed.map((t) => (
              <li key={t.testCode}>
                <button type="button" onClick={() => toggle(t.testCode)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-sunken">
                  <span className="mt-0.5">{checked.includes(t.testCode) ? <CheckSquare size={16} className="text-brand" /> : <Square size={16} className="text-ink-muted" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{testNameOf(catalog, t.testCode)}</span>
                      <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-ink-muted" title={t.rationale}>{t.rationale}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div>
          {proposed.length > 0 && (
            <button type="button" onClick={() => setShowCatalog(!showCatalog)} className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
              Add from the lab catalog <ChevronDown size={14} className={`transition ${showCatalog ? 'rotate-180' : ''}`} />
            </button>
          )}
          {(showCatalog || proposed.length === 0) && (
            <ul className={`grid gap-1 ${proposed.length ? 'mt-2' : '-mx-2'}`}>
              {others.map((t) => (
                <li key={t.code}>
                  <button type="button" onClick={() => toggle(t.code)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sunken">
                    <span className="mt-0.5">{checked.includes(t.code) ? <CheckSquare size={15} className="text-brand" /> : <Square size={15} className="text-ink-muted" />}</span>
                    <span className="text-xs"><span className="font-medium text-ink">{t.name}</span><span className="block text-ink-muted">{t.purpose}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <button type="button" onClick={() => setShowDetails(!showDetails)} className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
            Reason and note to the lab <ChevronDown size={14} className={`transition ${showDetails ? 'rotate-180' : ''}`} />
          </button>
          {showDetails && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="label" htmlFor="context">Reason for the order</label>
                <textarea id="context" className="field min-h-[90px]" value={context} onChange={(e) => setContext(e.target.value)}
                  placeholder="What you want answered — the results analysis reads this" />
              </div>
              <div>
                <label className="label" htmlFor="note">Note to the lab</label>
                <input id="note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        {error && <ErrorNote message={error} />}
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-xs text-ink-muted">To {assessment.ehrName} and Quest</span>
          <button type="button" className="btn-primary shrink-0 whitespace-nowrap" disabled={busy || checked.length === 0} onClick={submit}>
            {busy ? <Spinner size={15} /> : <FlaskConical size={15} />} Order {checked.length} test{checked.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </Card>
  )
}
