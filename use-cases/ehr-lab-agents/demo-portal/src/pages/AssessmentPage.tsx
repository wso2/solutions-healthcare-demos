import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, GitBranch, PanelRightClose, PanelRightOpen, Stethoscope, WifiOff } from 'lucide-react'
import { api, type Assessment, type LabCatalog } from '../lib/api'
import { usePolling } from '../lib/usePolling'
import { WAITING_ON, isTerminal, stagePosition, stepStates, type StepKey } from '../lib/stages'
import { formatDate, initials, titleCase } from '../lib/format'
import { Stepper } from '../components/Stepper'
import { Timeline } from '../components/Timeline'
import { IpsSummary } from '../components/IpsSummary'
import { Explorer, type EvaluateArgs } from '../components/Explorer'
import { CopilotPanel } from '../components/CopilotPanel'
import { ConclusionPanel, OrderStatusPanel, ReviewPanel } from '../components/JourneyPanels'
import { WorkflowBoard } from '../components/WorkflowBoard'
import { AllergyBanner, EhrBadge } from '../components/patient'
import { Avatar, Badge, Card, CardHeader, ErrorNote, Spinner, Working } from '../components/ui'

export function AssessmentPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'workflow' ? 'workflow' : 'clinical'
  const location = useLocation()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<LabCatalog>()
  const [temporalUi, setTemporalUi] = useState('http://localhost:8233')
  const { data: assessment, error, refresh } = usePolling(() => api.assessment(id), 2000, true, [id])

  useEffect(() => {
    api.catalog().then(setCatalog).catch(() => undefined)
    api.system().then((s) => setTemporalUi(s.workflow.uiUrl)).catch(() => undefined)
  }, [])

  // A selection handed over from the patient page: evaluate it as soon as the workflow waits on the physician.
  const pending = (location.state as { evaluation?: EvaluateArgs } | null)?.evaluation
  const sent = useRef(false)
  useEffect(() => {
    if (!pending || sent.current || !assessment || assessment.stage !== 'AWAITING_PHYSICIAN' || !assessment.data.summary) return
    sent.current = true
    void api.evaluate(assessment.id, pending.rows, pending.question, pending.dateFrom, pending.dateTo).then(() => {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
      void refresh()
    })
  }, [pending, assessment, navigate, location.pathname, location.search, refresh])

  const setView = (v: 'clinical' | 'workflow') => setParams(v === 'workflow' ? { view: 'workflow' } : {})

  if (error && !assessment) return <ErrorNote message={error} />
  if (!assessment) return <div className="flex justify-center py-20 text-ink-muted"><Spinner size={22} /></div>

  const patient = assessment.data.summary?.patient
  const position = stagePosition(assessment.stage)
  const waiting = WAITING_ON[assessment.waitingOn]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link to={patient ? `/physician/ehrs/${assessment.ehr}/patients/${assessment.patientId}` : '/physician'} className="btn-ghost px-2" aria-label="Back to patient">
            <ArrowLeft size={18} />
          </Link>
          <Avatar text={initials(assessment.patientName)} className="h-11 w-11 text-sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-ink">{assessment.patientName}</h1>
              <EhrBadge name={assessment.ehrName} />
            </div>
            <p className="text-xs text-ink-muted">
              {patient ? `${patient.age ?? '—'} y · ${titleCase(patient.gender)} · ${patient.mrn} · DOB ${formatDate(patient.birthDate)} · ` : ''}
              Longevity assessment <span className="font-mono">{assessment.id}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={assessment.stage === 'FAILED' ? 'act' : assessment.stage === 'COMPLETED' ? 'good' : waiting.tone}>
            {!isTerminal(assessment.stage) && position.state === 'working' && <Spinner size={12} />}
            {position.label}
          </Badge>
          <div className="flex rounded-lg border border-line bg-sunken p-0.5" role="tablist" aria-label="View">
            <ViewTab active={view === 'clinical'} onClick={() => setView('clinical')} icon={<Stethoscope size={14} />}>Clinical</ViewTab>
            <ViewTab active={view === 'workflow'} onClick={() => setView('workflow')} icon={<GitBranch size={14} />}>Workflow</ViewTab>
          </div>
          <a className="btn-secondary py-1.5 text-xs" href={`${temporalUi}/namespaces/default/workflows/${assessment.id}`} target="_blank" rel="noreferrer">
            Temporal <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-watch/40 bg-watch-soft px-3 py-2 text-sm text-watch-ink">
          <WifiOff size={16} /> Integration unreachable — reconnecting… The workflow's state is safe in Temporal.
        </div>
      )}
      {assessment.stage === 'FAILED' && assessment.error && <ErrorNote message={`Assessment stopped: ${assessment.error}`} />}

      {view === 'workflow' ? (
        <WorkflowBoard assessmentId={assessment.id} />
      ) : (
        <ClinicalView assessment={assessment} catalog={catalog} refresh={refresh} />
      )}
    </div>
  )
}

function ViewTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${active ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
    >
      {icon} {children}
    </button>
  )
}

function ClinicalView({ assessment, catalog, refresh }: { assessment: Assessment; catalog?: LabCatalog; refresh: () => Promise<void> }) {
  const failedAt = failedStep(assessment)
  const states = useMemo(() => stepStates(assessment.stage, failedAt), [assessment.stage, failedAt])
  const current: StepKey = assessment.stage === 'FAILED' ? failedAt ?? 'review' : stagePosition(assessment.stage).step
  const [selected, setSelected] = useState<StepKey>()
  const [followCurrent, setFollowCurrent] = useState(true)
  const step: StepKey = followCurrent || !selected ? current : selected
  const [timelineOpen, setTimelineOpen] = useState<boolean>()
  const showTimeline = timelineOpen ?? step !== 'evaluate'
  const select = (s: StepKey) => {
    setSelected(s)
    setFollowCurrent(s === current)
  }
  const summary = assessment.data.summary

  return (
    <div className="space-y-5">
      <Stepper states={states} selected={step} onSelect={select} waitingLabel={WAITING_ON[assessment.waitingOn].label.replace('Waiting on ', 'On ')} />
      {summary && <AllergyBanner allergies={summary.allergies} />}
      <div className={`grid gap-5 ${showTimeline ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
        <div className="min-w-0 space-y-3">
          <div className="flex justify-end">
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setTimelineOpen(!showTimeline)}>
              {showTimeline ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />} Integration timeline ({assessment.timeline.length})
            </button>
          </div>
          <StepView step={step} assessment={assessment} catalog={catalog} onChanged={() => { setFollowCurrent(true); void refresh() }} />
        </div>
        {showTimeline && (
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardHeader title="Integration timeline" subtitle="Every EHR, lab, agent, patient and physician step" />
              <div className="max-h-[calc(100vh-240px)] overflow-y-auto px-4 py-4">
                <Timeline events={assessment.timeline} />
              </div>
            </Card>
          </aside>
        )}
      </div>
    </div>
  )
}

function StepView({ step, assessment, catalog, onChanged }: { step: StepKey; assessment: Assessment; catalog?: LabCatalog; onChanged: () => void }) {
  const summary = assessment.data.summary
  const [evaluating, setEvaluating] = useState(false)
  switch (step) {
    case 'record':
      return summary ? <IpsSummary summary={summary} /> : (
        <Working title={`Pulling the patient record from ${assessment.ehrName}`} detail="Problems, allergies, medications, immunizations, procedures, visits, labs and vitals — FHIR searches in parallel." />
      )
    case 'evaluate':
      if (!summary) return <Working title="Pulling the patient record first" />
      if (assessment.stage !== 'AWAITING_PHYSICIAN') return <CopilotPanel assessment={assessment} catalog={catalog} onChanged={onChanged} />
      return (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Explorer
            ehr={assessment.ehr}
            ehrName={assessment.ehrName}
            patientId={assessment.patientId}
            evaluating={evaluating || assessment.data.copilot?.status === 'running'}
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
          <CopilotPanel assessment={assessment} catalog={catalog} onChanged={onChanged} />
        </div>
      )
    case 'patient':
    case 'lab':
      return <OrderStatusPanel assessment={assessment} catalog={catalog} />
    case 'analysis':
      return <ReviewPanel assessment={assessment} catalog={catalog} onChanged={onChanged} />
    case 'review':
      return assessment.stage === 'COMPLETED'
        ? <ConclusionPanel assessment={assessment} catalog={catalog} />
        : <ReviewPanel assessment={assessment} catalog={catalog} onChanged={onChanged} />
  }
}

/** For a failed assessment: the first step that never produced its output. */
function failedStep(assessment: Assessment): StepKey | undefined {
  if (assessment.stage !== 'FAILED') return undefined
  const d = assessment.data
  if (!d.summary) return 'record'
  if (!d.labOrder) return 'evaluate'
  if (!d.labVisit) return 'patient'
  if (!d.labResults) return 'lab'
  if (!d.carePlan) return 'analysis'
  return 'review'
}
