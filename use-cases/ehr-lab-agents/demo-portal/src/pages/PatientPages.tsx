import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Bell, CalendarCheck, Check, CheckCircle2, ChevronRight, Clock, FlaskConical, HeartPulse, MapPin, OctagonAlert,
  ShieldCheck, Sparkles, Stethoscope, Target,
} from 'lucide-react'
import { api, type LongevityRecord, type PatientJourney } from '../lib/api'
import { formatDate, formatNumber, formatTime, initials } from '../lib/format'
import { usePolling } from '../lib/usePolling'
import { BiomarkerChart } from '../components/BiomarkerChart'
import { EhrBadge } from '../components/patient'
import { Avatar, Badge, Empty, ErrorNote, Spinner } from '../components/ui'

// The patient app (the customer's layer 4). It shows where the patient's assessment is, what they need to
// do (go to the lab), and — only once the physician has released it — their plain-language report from
// the published health record. It never talks to the EHR or the lab.

export function PatientHome() {
  const { data: patients, error } = usePolling(() => api.patientAppPatients(), 5000)
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Patient app</h1>
        <p className="text-sm text-ink-muted">Sign in as a patient with an assessment.</p>
      </div>
      {error && <ErrorNote message={error} />}
      {!patients && !error && <div className="flex justify-center py-10 text-ink-muted"><Spinner /></div>}
      {patients && patients.length === 0 && (
        <div className="card"><Empty title="No patients yet" detail="Start an assessment in the physician workspace." icon={<HeartPulse size={22} />} /></div>
      )}
      <ul className="space-y-3">
        {patients?.map((p) => (
          <li key={p.ehr + p.patientId}>
            <Link to={`/patient/${p.ehr}/${p.patientId}`} className="card flex items-center gap-4 px-5 py-4 transition hover:shadow-pop">
              <Avatar text={initials(p.patientName)} className="h-11 w-11 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{p.patientName}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <EhrBadge name={p.ehrName} />
                  {p.stage === 'AWAITING_PATIENT' ? <Badge tone="watch"><Bell size={11} /> Action needed</Badge> : p.stage === 'COMPLETED' ? <Badge tone="good">Report ready</Badge> : <Badge>In progress</Badge>}
                </p>
              </div>
              <ChevronRight size={18} className="text-ink-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

const JOURNEY_STEPS: { key: string; label: string; icon: typeof Check }[] = [
  { key: 'consultation', label: 'Consultation', icon: Stethoscope },
  { key: 'visit-lab', label: 'Visit the lab', icon: MapPin },
  { key: 'processing', label: 'Lab processing', icon: FlaskConical },
  { key: 'reviewing', label: 'Doctor reviewing', icon: Clock },
  { key: 'ready', label: 'Results ready', icon: CheckCircle2 },
]

export function PatientJourneyPage() {
  const { ehr = '', patientId = '' } = useParams()
  const { data, error } = usePolling(() => api.journey(ehr, patientId), 3000, true, [ehr, patientId])
  if (error && !data) return <div className="mx-auto max-w-3xl"><ErrorNote message={error} /></div>
  if (!data) return <div className="flex justify-center py-20 text-ink-muted"><Spinner size={22} /></div>
  const { assessment, longevityRecord } = data
  const ready = assessment?.step === 'ready' || (!assessment && longevityRecord)

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <Link to="/patient" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft size={15} /> All patients</Link>
      {assessment && assessment.step !== 'ready' && <JourneyView journey={data} />}
      {ready && longevityRecord && <ReportView record={longevityRecord} />}
      {!assessment && !longevityRecord && <div className="card"><Empty title="Nothing to show yet" icon={<HeartPulse size={22} />} /></div>}
      {assessment && assessment.step !== 'ready' && longevityRecord && <PreviousReport record={longevityRecord} />}
    </div>
  )
}

function JourneyView({ journey }: { journey: PatientJourney }) {
  const a = journey.assessment!
  const index = JOURNEY_STEPS.findIndex((s) => s.key === a.step)
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-gradient-to-br from-brand-soft via-surface to-surface px-6 py-6 shadow-card">
        <p className="text-sm font-medium text-brand-ink">Your health assessment</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
          {a.step === 'visit-lab' ? 'Next step: your blood test' : a.step === 'processing' ? 'Your sample is at the lab' : a.step === 'reviewing' ? 'Dr. Park is reviewing your results' : a.step === 'stopped' ? 'Your assessment was paused' : 'Dr. Park is reviewing your record'}
        </h1>
        <ol className="mt-6 grid grid-cols-5 gap-2">
          {JOURNEY_STEPS.map((s, i) => {
            const done = i < index
            const current = i === index
            const Icon = s.icon
            return (
              <li key={s.key} className="flex flex-col items-center gap-1.5 text-center">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full ${done ? 'bg-brand text-white dark:text-canvas' : current ? 'bg-surface text-brand-ink ring-2 ring-brand' : 'bg-sunken text-ink-muted'}`}>
                  {done ? <Check size={16} strokeWidth={3} /> : <Icon size={16} />}
                </span>
                <span className={`text-[11px] font-medium leading-tight ${current ? 'text-ink' : 'text-ink-muted'}`}>{s.label}</span>
              </li>
            )
          })}
        </ol>
      </section>

      {a.step === 'visit-lab' && a.notification && (
        <section className="overflow-hidden rounded-2xl border border-watch/50 bg-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-watch/40 bg-watch-soft px-5 py-3 text-sm font-semibold text-watch-ink">
            <Bell size={16} /> Action needed: visit {a.labName}
          </div>
          <div className="space-y-4 px-5 py-5">
            <p className="text-[15px] leading-relaxed text-ink">{a.notification.message}</p>
            <Block title="Before you go">
              <ul className="space-y-1.5">
                {a.notification.instructions.map((i) => <li key={i} className="flex gap-2 text-sm text-ink"><Check size={15} className="mt-0.5 shrink-0 text-brand" /> {i}</li>)}
              </ul>
            </Block>
            <Block title="Tests ordered">
              <div className="flex flex-wrap gap-1.5">{a.tests.map((t) => <Badge key={t.code} className="!whitespace-normal">{t.name}</Badge>)}</div>
            </Block>
            {a.orderNumber && (
              <div className="rounded-xl border border-dashed border-line px-4 py-3 text-center">
                <p className="text-xs uppercase tracking-wider text-ink-muted">Show this at the front desk</p>
                <p className="mt-1 font-mono text-lg font-semibold tracking-widest text-ink">{a.orderNumber}</p>
              </div>
            )}
          </div>
        </section>
      )}
      {a.step === 'consultation' && (
        <section className="card px-5 py-5 text-sm text-ink-soft">
          <p className="flex items-center gap-2 font-medium text-ink"><Stethoscope size={16} className="text-brand" /> What happens next</p>
          <p className="mt-1">Dr. Park is going through your health record and may order blood tests. If you need to visit the lab, you'll see where to go and how to prepare right here.</p>
        </section>
      )}
      {a.step === 'processing' && (
        <section className="card px-5 py-5 text-sm text-ink-soft">
          <p className="flex items-center gap-2 font-medium text-ink"><FlaskConical size={16} className="text-brand" /> Sample collected {a.labVisit ? formatTime(a.labVisit.collectedAt) : ''}</p>
          <p className="mt-1">{a.labName} is running your tests. Results usually arrive within a day; we'll let you know.</p>
        </section>
      )}
      {a.step === 'reviewing' && (
        <section className="card px-5 py-5 text-sm text-ink-soft">
          <p className="flex items-center gap-2 font-medium text-ink"><Clock size={16} className="text-brand" /> Your results are in</p>
          <p className="mt-1">Dr. Park reviews every report before it is shared with you. You'll see it here as soon as it's released.</p>
        </section>
      )}
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      {children}
    </div>
  )
}

function PreviousReport({ record }: { record: LongevityRecord }) {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <button type="button" className="btn-secondary" onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Show'} your previous report ({formatDate(record.generatedAt)})
      </button>
      {open && <div className="mt-4"><ReportView record={record} /></div>}
    </section>
  )
}

const resultStyle = {
  good: { icon: CheckCircle2, word: 'Looking good', ring: 'border-good/30', pill: 'bg-good-soft text-good-ink' },
  watch: { icon: AlertTriangle, word: 'Keep an eye on', ring: 'border-watch/50', pill: 'bg-watch-soft text-watch-ink' },
  act: { icon: OctagonAlert, word: 'Needs action', ring: 'border-act/30', pill: 'bg-act-soft text-act-ink' },
}

function ReportView({ record }: { record: LongevityRecord }) {
  const report = record.patientReport
  const firstName = record.patient.name.split(' ')[0]
  const trends = record.biomarkers.filter((b) => b.history.length >= 2).slice(0, 4)

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-brand-soft via-surface to-surface shadow-card">
        <div className="px-6 py-7 sm:px-8">
          <p className="text-sm font-medium text-brand-ink">Your health report · {formatDate(record.generatedAt)}</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">Hi {firstName}. {report.headline}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{report.whatWeFound}</p>
          <div className="mt-5 flex items-center gap-2 text-xs text-ink-muted">
            <ShieldCheck size={14} className="text-brand" />
            Reviewed and released by Dr. Elena Park, MD on {formatDate(record.provenance.approvedAt)}
          </div>
          {record.assessment.physicianComment && (
            <p className="mt-3 rounded-lg bg-surface/70 px-3 py-2 text-sm text-ink">“{record.assessment.physicianComment}” — Dr. Park</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">Your key results</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {report.keyResults.map((r) => {
            const style = resultStyle[r.status] ?? resultStyle.watch
            const Icon = style.icon
            return (
              <div key={r.name} className={`rounded-xl border bg-surface p-4 shadow-card ${style.ring}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-ink">{r.name}</p>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.pill}`}>
                    <Icon size={12} /> {style.word}
                  </span>
                </div>
                <p className="mt-1 text-lg font-semibold leading-snug tabular-nums text-ink">{r.value}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.explanation}</p>
              </div>
            )
          })}
        </div>
      </section>

      {trends.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-semibold text-ink">How your numbers have changed</h2>
          <p className="mb-3 text-sm text-ink-muted">The shaded band is the lab's normal range. The last point is your newest result.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {trends.map((b) => (
              <div key={b.code} className="card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium text-ink">{b.name}</p>
                  <p className="text-sm font-semibold tabular-nums text-ink">
                    {formatNumber(b.history[b.history.length - 1].value)} <span className="text-xs font-normal text-ink-muted">{b.unit}</span>
                  </p>
                </div>
                <BiomarkerChart points={b.history} unit={b.unit} referenceLow={b.referenceLow} referenceHigh={b.referenceHigh} height={130} />
                {b.longevityTarget && <p className="text-xs text-ink-muted">Your target: {b.longevityTarget}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card px-6 py-5">
        <h2 className="text-base font-semibold text-ink">Your plan</h2>
        <ol className="mt-4 space-y-4">
          {report.yourPlan.map((item, i) => (
            <li key={item.title} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white dark:text-canvas">{i + 1}</span>
              <div>
                <p className="font-medium text-ink">{item.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card px-5 py-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><Target size={17} className="text-brand" /> Goals</h2>
          <ul className="mt-3 space-y-3">
            {record.carePlan.goals.map((g) => (
              <li key={g.title}>
                <p className="text-sm font-medium text-ink">{g.title}</p>
                <p className="text-xs text-ink-muted">{g.target} · {g.timeframe}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="card px-5 py-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><CalendarCheck size={17} className="text-brand" /> What happens next</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            {report.nextSteps.map((s) => <li key={s} className="leading-snug">• {s}</li>)}
          </ul>
          {record.carePlan.followUpLabs.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Follow-up tests</p>
              {record.carePlan.followUpLabs.map((f) => (
                <p key={f.testCode} className="flex justify-between gap-2 text-sm"><span className="text-ink">{f.name}</span><span className="text-ink-muted">{f.timing}</span></p>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl bg-sunken px-6 py-5">
        <p className="text-[15px] leading-relaxed text-ink">{report.closingNote}</p>
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
          <Sparkles size={13} className="mt-0.5 shrink-0 text-ai" />
          Prepared from your records at {record.sources.ehr.system} and {record.sources.lab.system}. Written with AI assistance and reviewed by your physician before it was shared with you.
        </p>
      </section>
    </div>
  )
}
