import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, FileHeart, Play, Search } from 'lucide-react'
import { api, type AssessmentListItem, type PatientSummary } from '../lib/api'
import { relativeTime } from '../lib/format'
import { WAITING_ON, stagePosition } from '../lib/stages'
import { Explorer, type EvaluateArgs } from '../components/Explorer'
import { IpsSummary } from '../components/IpsSummary'
import { PatientHeader } from '../components/patient'
import { Badge, Card, Empty, ErrorNote, Spinner } from '../components/ui'

// One patient, live from their EHR: the International Patient Summary, the data explorer, and their
// assessments. Asking the Copilot from the explorer starts (or resumes) an assessment.

const TABS = [
  { key: 'summary', label: 'Patient summary', icon: FileHeart },
  { key: 'explorer', label: 'EHR explorer', icon: Search },
  { key: 'assessments', label: 'Assessments', icon: ClipboardList },
] as const

export function PatientPage() {
  const { ehr = 'cerner', patientId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'summary'
  const navigate = useNavigate()
  const [summary, setSummary] = useState<PatientSummary>()
  const [error, setError] = useState<string>()
  const [assessments, setAssessments] = useState<AssessmentListItem[]>()
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    setSummary(undefined)
    api.summary(ehr, patientId).then(setSummary).catch((e) => setError(e instanceof Error ? e.message : String(e)))
    api.patientAssessments(ehr, patientId).then(setAssessments).catch(() => setAssessments([]))
  }, [ehr, patientId])

  const open = assessments?.find((a) => a.stage !== 'COMPLETED' && a.stage !== 'FAILED')

  async function start(evaluation?: EvaluateArgs) {
    setStarting(true)
    try {
      const { id } = await api.startAssessment(ehr, patientId)
      navigate(`/physician/assessments/${id}`, { state: evaluation ? { evaluation } : undefined })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStarting(false)
    }
  }

  if (error && !summary) return <ErrorNote message={error} />
  if (!summary) return <div className="flex justify-center py-20 text-ink-muted"><Spinner size={22} /></div>

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <Link to={`/physician?ehr=${ehr}`} className="btn-ghost mt-1 px-2" aria-label="Back to patients"><ArrowLeft size={18} /></Link>
        <div className="min-w-0 flex-1">
          <PatientHeader
            patient={summary.patient}
            allergies={summary.allergies}
            actions={open ? (
              <Link to={`/physician/assessments/${open.id}`} className="btn-primary">
                <Play size={15} /> Open active assessment
              </Link>
            ) : (
              <button type="button" className="btn-primary" onClick={() => start()} disabled={starting}>
                {starting ? <Spinner size={15} /> : <Play size={15} />} Start longevity assessment
              </button>
            )}
          />
        </div>
      </div>

      <div className="flex gap-1 border-b border-line">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setParams({ tab: key })}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === key ? 'border-brand text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            <Icon size={15} /> {label}
            {key === 'assessments' && assessments && <span className="rounded-full bg-sunken px-1.5 text-[11px] tabular-nums text-ink-muted">{assessments.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'summary' && <IpsSummary summary={summary} />}
      {tab === 'explorer' && (
        <Explorer
          ehr={ehr}
          ehrName={summary.patient.ehrName}
          patientId={patientId}
          evaluating={starting}
          onEvaluate={async (args) => start(args)}
        />
      )}
      {tab === 'assessments' && <AssessmentHistory assessments={assessments} />}
    </div>
  )
}

function AssessmentHistory({ assessments }: { assessments?: AssessmentListItem[] }) {
  if (!assessments) return <div className="flex justify-center py-10 text-ink-muted"><Spinner /></div>
  if (assessments.length === 0) return <Card><Empty title="No assessments yet" detail="Start a longevity assessment to evaluate this patient with the Copilot and order labs." /></Card>
  return (
    <Card>
      <ul className="divide-y divide-line">
        {assessments.map((a) => (
          <li key={a.id}>
            <Link to={`/physician/assessments/${a.id}`} className="flex flex-col gap-1 px-5 py-4 hover:bg-sunken/60 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  Longevity assessment <span className="font-mono text-xs text-ink-muted">{a.id}</span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{a.headline ?? (a.tests.length ? `Ordered: ${a.tests.join(', ')}` : stagePosition(a.stage).label)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {a.stage === 'FAILED' ? <Badge tone="act">Stopped</Badge> : <Badge tone={WAITING_ON[a.waitingOn].tone}>{a.waitingOn === 'none' ? 'Released' : WAITING_ON[a.waitingOn].label}</Badge>}
                <span className="text-xs text-ink-muted">{relativeTime(a.createdAt)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
