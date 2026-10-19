import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, ChevronDown, FlaskConical, MessageSquare, Send, Sparkles, Square } from 'lucide-react'
import { api, type Assessment, type CopilotEvaluation, type LabCatalog } from '../lib/api'
import { formatTime } from '../lib/format'
import { isCopilotFailure } from '../lib/agentErrors'
import { AgentFailureNote, AgentReceipt, useAssessmentRuns } from './governance'
import { AiBadge, Badge, Card, CardHeader, ErrorNote, Markdown, SeverityChip, Spinner, levelSeverity } from './ui'

// The Diagnostic Copilot: a conversation about the records the physician selected, its evaluation and
// proposed panel, and the order — which completes the workflow's "evaluate and order labs" human task.

const priorityTone = { essential: 'act', recommended: 'brand', optional: 'neutral' } as const

export function CopilotPanel({ assessment, catalog, onChanged }: { assessment: Assessment; catalog?: LabCatalog; onChanged: () => void }) {
  const { data } = assessment
  const evaluation = data.evaluation
  const thread = data.copilot?.messages ?? []
  const running = data.copilot?.status === 'running'
  const canOrder = assessment.stage === 'AWAITING_PHYSICIAN' && !!assessment.openTasks.orderLabs
  const runs = useAssessmentRuns(assessment.id, running || assessment.stage === 'AWAITING_PHYSICIAN')
  const lastFailure = data.copilot?.status === 'failed' ? [...thread].reverse().find((m) => m.role === 'copilot' && isCopilotFailure(m.text)) : undefined

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Diagnostic Copilot"
          subtitle="Evaluates the records you select · conversation kept in Postgres"
          icon={<Sparkles size={16} />}
          action={evaluation ? <AiBadge /> : undefined}
        />
        <div className="space-y-4 px-5 py-4">
          {thread.length === 0 && !running && (
            <p className="text-sm text-ink-soft">
              Select records in the explorer — a date range, the labs, the notes — and ask for an overview and evaluation.
              The Copilot can also query the EHR itself through the WSO2 FHIR MCP server.
            </p>
          )}
          {thread.length > 0 && <Thread messages={lastFailure ? thread.filter((m) => m !== lastFailure) : thread} />}
          {running && (
            <div className="flex items-center gap-2 text-sm text-ai-ink"><Spinner size={15} /> Copilot is reading the records…</div>
          )}
          {data.copilot?.status === 'failed' && (lastFailure
            ? <AgentFailureNote message={lastFailure.text} hint="Select records in the explorer and ask again." />
            : <ErrorNote message="The Copilot could not finish. Try again or ask a narrower question." />)}
          {evaluation && <FollowUp assessment={assessment} disabled={running} onSent={onChanged} />}
        </div>
        {thread.length > 0 && <AgentReceipt step="copilot" runs={runs} />}
      </Card>

      {evaluation && <EvaluationView evaluation={evaluation} />}

      {canOrder && <OrderForm assessment={assessment} evaluation={evaluation} catalog={catalog} onChanged={onChanged} />}
    </div>
  )
}

function Thread({ messages }: { messages: { role: string; text: string; at: string; records?: number }[] }) {
  return (
    <ol className="space-y-3">
      {messages.map((m, i) => m.role === 'copilot' && isCopilotFailure(m.text) ? (
        <li key={i} className="flex justify-start">
          <div className="w-full max-w-[88%]">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted"><Sparkles size={11} className="text-ai" /> Copilot · {formatTime(m.at)}</p>
            <AgentFailureNote message={m.text} compact />
          </div>
        </li>
      ) : (
        <li key={i} className={`flex ${m.role === 'physician' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm ${m.role === 'physician' ? 'rounded-br-sm bg-brand-soft text-ink' : 'rounded-bl-sm border border-ai/20 bg-ai-soft/60 text-ink'}`}>
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
              {m.role === 'physician' ? 'You' : <><Sparkles size={11} className="text-ai" /> Copilot</>}
              <span>· {formatTime(m.at)}</span>
              {m.records ? <span>· {m.records} records</span> : null}
            </p>
            <p className="leading-relaxed">{m.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function FollowUp({ assessment, disabled, onSent }: { assessment: Assessment; disabled: boolean; onSent: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  async function send() {
    if (!text.trim()) return
    setBusy(true)
    try {
      await api.messageCopilot(assessment.id, text)
      setText('')
      onSent()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex gap-2 border-t border-line pt-4">
      <input
        className="field"
        placeholder="Reply or ask a follow-up — “Drop thyroid, TSH was normal in March”"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void send()}
        disabled={disabled || busy}
      />
      <button type="button" className="btn-secondary" onClick={send} disabled={disabled || busy || !text.trim()} aria-label="Send to Copilot">
        {busy ? <Spinner size={15} /> : <Send size={15} />}
      </button>
    </div>
  )
}

function EvaluationView({ evaluation }: { evaluation: CopilotEvaluation }) {
  const [showQuestions, setShowQuestions] = useState(false)
  return (
    <Card>
      <CardHeader title="Overview & evaluation" icon={<MessageSquare size={16} />} action={<AiBadge label="AI" />} />
      <div className="space-y-5 px-5 py-4">
        <Markdown>{evaluation.overview}</Markdown>
        {evaluation.keyFindings.length > 0 && (
          <div>
            <h3 className="eyebrow mb-2">Key findings</h3>
            <ul className="space-y-2.5">
              {evaluation.keyFindings.map((f) => (
                <li key={f.finding} className="flex items-start gap-3">
                  <div className="w-24 shrink-0 pt-0.5"><SeverityChip severity={levelSeverity(f.significance)} label={f.significance} /></div>
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{f.finding}</p>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {f.evidence.slice(0, 4).map((e) => <li key={e} className="rounded bg-sunken px-1.5 py-0.5 text-[11px] text-ink-muted">{e}</li>)}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h3 className="eyebrow mb-2">Risk hypotheses</h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {evaluation.riskHypotheses.map((h) => (
              <li key={h.area} className="rounded-lg border border-line px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium capitalize text-ink">{h.area}</p>
                  <SeverityChip severity={levelSeverity(h.likelihood)} label={h.likelihood} />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{h.rationale}</p>
              </li>
            ))}
          </ul>
        </div>
        {evaluation.questionsForPatient.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowQuestions(!showQuestions)} className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
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
        {evaluation.reasoningNote && <p className="border-t border-line pt-3 text-xs italic text-ink-muted">{evaluation.reasoningNote}</p>}
      </div>
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

  // Follow the Copilot's latest proposal (essential + recommended), until the physician edits it.
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
  const testName = (code: string) => catalog?.orderableTests.find((t) => t.code === code)?.name ?? code
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
      <CardHeader
        title="Order labs"
        subtitle="Completes the workflow's “evaluate and order labs” task: order of record in the EHR, order to the lab, patient notified"
        icon={<FlaskConical size={16} />}
      />
      <div className="space-y-4 px-5 py-4">
        {proposed.length > 0 && (
          <ul className="space-y-1">
            {proposed.map((t) => (
              <li key={t.testCode}>
                <button type="button" onClick={() => toggle(t.testCode)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-sunken">
                  <span className="mt-0.5">{checked.includes(t.testCode) ? <CheckSquare size={16} className="text-brand" /> : <Square size={16} className="text-ink-muted" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{testName(t.testCode)}</span>
                      <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{t.rationale}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <button type="button" onClick={() => setShowCatalog(!showCatalog)} className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
            {proposed.length ? 'Add from the lab catalog' : 'Lab catalog'} <ChevronDown size={14} className={`transition ${showCatalog ? 'rotate-180' : ''}`} />
          </button>
          {showCatalog && (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
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
          <label className="label" htmlFor="context">Reason for the order</label>
          <textarea id="context" className="field min-h-[70px]" value={context} onChange={(e) => setContext(e.target.value)}
            placeholder="What you want answered — the Results Analysis agent reads this" />
        </div>
        <div>
          <label className="label" htmlFor="note">Note to the lab</label>
          <input id="note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <ErrorNote message={error} />}
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-xs text-ink-muted">{checked.length} test{checked.length === 1 ? '' : 's'} · {assessment.ehrName} + Quest Diagnostics</span>
          <button type="button" className="btn-primary" disabled={busy || checked.length === 0} onClick={submit}>
            {busy ? <Spinner size={15} /> : <FlaskConical size={15} />} Order {checked.length} tests
          </button>
        </div>
      </div>
    </Card>
  )
}
