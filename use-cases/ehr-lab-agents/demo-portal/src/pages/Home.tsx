import { useEffect, type CSSProperties } from 'react'
import {
  ArrowRight, ArrowUpRight, Database, FileSignature, FlaskConical, HeartPulse, Microscope, Sparkles, Stethoscope, UserRound, type LucideIcon,
} from 'lucide-react'
import { BrandMark, HealthIndicator, ThemeToggle } from '../components/AppShell'

// Landing page: the flow, the systems it connects, and the three apps. Each app opens in its own tab so
// the presenter can keep the physician, patient and lab side by side.

type Actor = { label: string; icon: LucideIcon; color: string }

const ACTORS = {
  ehr: { label: 'EHR', icon: Database, color: 'rgb(var(--ehr))' },
  physician: { label: 'Physician', icon: Stethoscope, color: 'rgb(var(--physician))' },
  ai: { label: 'AI agents', icon: Sparkles, color: 'rgb(var(--ai))' },
  patient: { label: 'Patient', icon: UserRound, color: 'rgb(var(--brand))' },
  lab: { label: 'Lab', icon: FlaskConical, color: 'rgb(var(--lab))' },
} satisfies Record<string, Actor>

type AppLink = { href: string; label: string }
const PHYSICIAN: AppLink = { href: '/physician', label: 'Physician workspace' }
const PATIENT: AppLink = { href: '/patient', label: 'Patient app' }
const LAB: AppLink = { href: '/lab', label: 'Lab console' }

const STEPS: { title: string; text: string; actors: Actor[]; icon: LucideIcon; open: AppLink[] }[] = [
  {
    title: 'Pull the record',
    text: 'The patient’s history arrives from Oracle Health or athenahealth over FHIR: problems, medications, labs, notes and vitals.',
    actors: [ACTORS.ehr],
    icon: Database,
    open: [PHYSICIAN],
  },
  {
    title: 'Order labs',
    text: 'The physician reviews the record and orders a lab panel. The order is recorded in the EHR and sent to the lab.',
    actors: [ACTORS.physician],
    icon: Stethoscope,
    open: [PHYSICIAN],
  },
  {
    title: 'Lab visit & results',
    text: 'The patient is notified and visits the lab. Results flow back by webhook and are filed in the EHR.',
    actors: [ACTORS.patient, ACTORS.lab],
    icon: FlaskConical,
    open: [PATIENT, LAB],
  },
  {
    title: 'AI analysis',
    text: 'New results are compared with years of history. A chart note, goals and a plain-language patient report are drafted.',
    actors: [ACTORS.ai],
    icon: Microscope,
    open: [PHYSICIAN],
  },
  {
    title: 'Review & release',
    text: 'The physician signs off. The note is finalised in the EHR and the patient reads their report in the app.',
    actors: [ACTORS.physician, ACTORS.patient],
    icon: FileSignature,
    open: [PHYSICIAN, PATIENT],
  },
]

const APPS: { link: AppLink; icon: LucideIcon; color: string; who: string; text: string; points: string[] }[] = [
  {
    link: PHYSICIAN,
    icon: Stethoscope,
    color: 'rgb(var(--physician))',
    who: 'For the physician',
    text: 'Find a patient in either EHR, review their summary, order labs, then review the AI analysis and release the results.',
    points: ['Patient summary from FHIR', 'Lab orders', 'AI results analysis and care plan'],
  },
  {
    link: PATIENT,
    icon: HeartPulse,
    color: 'rgb(var(--brand))',
    who: 'For the patient',
    text: 'Where the patient is asked to visit the lab, follows the progress, and reads their report once the physician releases it.',
    points: ['Lab visit instructions', 'Live progress', 'Plain-language report'],
  },
  {
    link: LAB,
    icon: FlaskConical,
    color: 'rgb(var(--lab))',
    who: 'Presenter tool · simulated lab',
    text: 'Plays the reference lab: check the patient in, collect the specimen and release results to resume the flow.',
    points: ['Incoming orders', 'Collect specimen', 'Release results'],
  },
]

export function Home() {
  useEffect(() => {
    document.title = 'Healthspan · EHR + lab agentic integration'
  }, [])
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <BrandMark />
        <HealthIndicator />
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-6xl space-y-16 px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <Hero />
        <Flow />
        <Apps />
        <p className="text-center text-xs text-ink-muted">Demo environment · synthetic patient data · AI output is always reviewed by a physician before release</p>
      </main>
    </div>
  )
}

function Hero() {
  return (
    <section className="relative text-center">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-16 -z-10 mx-auto h-72 max-w-3xl rounded-full bg-gradient-to-r from-ehr/15 via-ai/15 to-lab/15 blur-3xl" />
      <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl sm:leading-[1.1]">
        EHR history meets lab results.{' '}
        <span className="block bg-gradient-to-r from-ehr via-ai to-lab bg-clip-text text-transparent">Risk caught early.</span>
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-soft sm:text-base">
        One connected flow pulls the patient’s record, lets the physician order labs, waits for the patient and the lab,
        and turns the results into a care plan the physician reviews and releases.
      </p>
    </section>
  )
}

function SectionTitle({ eyebrow, title, text }: { eyebrow?: string; title: string; text?: string }) {
  return (
    <div className="mx-auto mb-8 max-w-2xl text-center">
      {eyebrow && <p className="eyebrow mb-2 text-brand-ink">{eyebrow}</p>}
      <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      {text && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{text}</p>}
    </div>
  )
}

function Flow() {
  return (
    <section>
      <SectionTitle eyebrow="How it works" title="Five steps, one assessment" text="Every step is tracked by a durable workflow. AI drafts the analysis; the physician decides." />
      <ol className="relative grid gap-4 lg:grid-cols-5">
        <span aria-hidden className="flow-line absolute left-[10%] right-[10%] top-7 hidden h-0.5 lg:block" />
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex gap-4 lg:flex-col lg:gap-0">
            {i < STEPS.length - 1 && <span aria-hidden className="flow-line-v absolute bottom-[-1rem] left-7 top-14 w-0.5 lg:hidden" />}
            <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface shadow-card lg:mx-auto">
              <s.icon size={22} style={{ color: s.actors[0].color }} />
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-surface">{i + 1}</span>
            </span>
            <div className="card flex min-w-0 flex-1 flex-col p-4 lg:mt-4">
              <div className="flex flex-wrap gap-1">
                {s.actors.map((a) => (
                  <span key={a.label} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-ink"
                    style={{ background: `color-mix(in srgb, ${a.color} 14%, transparent)` } as CSSProperties}>
                    <a.icon size={11} style={{ color: a.color }} /> {a.label}
                  </span>
                ))}
              </div>
              <h3 className="mt-2.5 font-semibold text-ink">{s.title}</h3>
              <p className="mt-1 flex-1 text-[13px] leading-relaxed text-ink-soft">{s.text}</p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3">
                {s.open.map((o) => (
                  <a key={o.href} href={o.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline">
                    {o.label} <ArrowUpRight size={12} />
                  </a>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Apps() {
  return (
    <section>
      <SectionTitle title="Demo Apps" />
      <div className="grid gap-4 md:grid-cols-3">
        {APPS.map(({ link, icon: Icon, color, who, text, points }) => (
          <a key={link.href} href={link.href} target="_blank" rel="noopener"
            className="card group relative flex flex-col overflow-hidden p-6 transition hover:-translate-y-0.5 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
            <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-card" style={{ background: color }}><Icon size={21} /></span>
            <p className="mt-4 text-xs font-medium text-ink-muted">{who}</p>
            <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-ink">{link.label}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{text}</p>
            <ul className="mt-4 flex-1 space-y-1.5">
              {points.map((p) => (
                <li key={p} className="flex items-center gap-2 text-[13px] text-ink"><ArrowRight size={13} className="text-ink-muted" /> {p}</li>
              ))}
            </ul>
          </a>
        ))}
      </div>
    </section>
  )
}
