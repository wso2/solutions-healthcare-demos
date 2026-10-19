import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, WifiOff } from 'lucide-react'
import { api, type Assessment, type LabCatalog } from '../lib/api'
import { usePolling } from '../lib/usePolling'
import { WAITING_ON, isTerminal, stagePosition, stepStates, type StepKey } from '../lib/stages'
import { formatDate, initials, titleCase } from '../lib/format'
import { Stepper } from '../components/Stepper'
import { IpsSummary } from '../components/IpsSummary'
import { type EvaluateArgs } from '../components/Explorer'
import { EvaluateStep } from '../components/EvaluationPanel'
import { ConclusionPanel, OpenReviews, OrderStatusPanel, ReviewPanel } from '../components/JourneyPanels'
import { AllergyBanner, EhrBadge } from '../components/patient'
import { Avatar, Badge, ErrorNote, Spinner, Working } from '../components/ui'

export function AssessmentPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<LabCatalog>()
  const { data: assessment, error, refresh } = usePolling(() => api.assessment(id), 2000, true, [id])

  useEffect(() => {
    api.catalog().then(setCatalog).catch(() => undefined)
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

  if (error && !assessment) return <ErrorNote message={error} />
  if (!assessment) return <div className="flex justify-center py-20 text-ink-muted"><Spinner size={22} /></div>

  const patient = assessment.data.summary?.patient
  const position = stagePosition(assessment.stage)
  const waiting = WAITING_ON[assessment.waitingOn]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={patient ? `/physician/ehrs/${assessment.ehr}/patients/${assessment.patientId}` : '/physician'} className="btn-ghost px-2" aria-label="Back to patient">
            <ArrowLeft size={18} />
          </Link>
          <Avatar text={initials(assessment.patientName)} className="h-11 w-11 text-sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-ink">{assessment.patientName}</h1>
              <EhrBadge name={assessment.ehrName} />
            </div>
            <p className="break-words text-xs text-ink-muted">
              {patient ? `${patient.age ?? '—'} y · ${titleCase(patient.gender)} · ${patient.mrn} · DOB ${formatDate(patient.birthDate)} · ` : ''}
              Assessment <span className="font-mono">{assessment.id}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={assessment.stage === 'FAILED' ? 'act' : assessment.stage === 'COMPLETED' ? 'good' : waiting.tone}>
            {!isTerminal(assessment.stage) && position.state === 'working' && <Spinner size={12} />}
            {position.label}
          </Badge>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-watch/40 bg-watch-soft px-3 py-2 text-sm text-watch-ink">
          <WifiOff size={16} /> Connection lost — reconnecting… Nothing is lost.
        </div>
      )}
      {assessment.stage === 'FAILED' && assessment.error && <ErrorNote message={`Assessment stopped: ${assessment.error}`} />}

      <ClinicalView assessment={assessment} catalog={catalog} refresh={refresh} />
    </div>
  )
}

function ClinicalView({ assessment, catalog, refresh }: { assessment: Assessment; catalog?: LabCatalog; refresh: () => Promise<void> }) {
  const failedAt = failedStep(assessment)
  const states = useMemo(() => stepStates(assessment.stage, failedAt), [assessment.stage, failedAt])
  const current: StepKey = assessment.stage === 'FAILED' ? failedAt ?? 'review' : stagePosition(assessment.stage).step
  const [selected, setSelected] = useState<StepKey>()
  const [followCurrent, setFollowCurrent] = useState(true)
  const step: StepKey = followCurrent || !selected ? current : selected
  const select = (s: StepKey) => {
    setSelected(s)
    setFollowCurrent(s === current)
  }
  const summary = assessment.data.summary

  return (
    <div className="space-y-5">
      <Stepper states={states} selected={step} onSelect={select} waitingLabel={WAITING_ON[assessment.waitingOn].label.replace('Waiting on ', 'On ')} />
      {summary && <AllergyBanner allergies={summary.allergies} />}
      <OpenReviews assessment={assessment} onChanged={() => { setFollowCurrent(true); void refresh() }} />
      <StepView step={step} assessment={assessment} catalog={catalog} onChanged={() => { setFollowCurrent(true); void refresh() }} />
    </div>
  )
}

function StepView({ step, assessment, catalog, onChanged }: { step: StepKey; assessment: Assessment; catalog?: LabCatalog; onChanged: () => void }) {
  const summary = assessment.data.summary
  switch (step) {
    case 'record':
      return summary ? <IpsSummary summary={summary} /> : (
        <Working title={`Pulling the patient record from ${assessment.ehrName}`} detail="Problems, allergies, medications, immunizations, procedures, visits, labs and vitals." />
      )
    case 'evaluate':
      if (!summary) return <Working title="Pulling the patient record first" />
      return <EvaluateStep assessment={assessment} catalog={catalog} onChanged={onChanged} />
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
  if (!d.labResults) return 'lab'
  if (!d.carePlan) return 'analysis'
  return 'review'
}
