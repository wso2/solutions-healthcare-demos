import { useEffect, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowRight, ArrowUpRight, Cable, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Database, FileSignature, FlaskConical,
  HeartPulse, Microscope, Plug, ShieldCheck, Sparkles, Stethoscope, UserRound, Workflow, type LucideIcon,
} from 'lucide-react'
import { BrandMark, HealthIndicator, ThemeToggle } from '../components/AppShell'

// Landing page: what was built (the architecture, for business and technical readers alike), the flow, and the
// three apps. Each app opens in its own tab so the presenter can keep the physician, patient and lab side by side.

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
    text: 'The patient’s history arrives from the EHR over FHIR: problems, medications, labs, notes and vitals.',
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
    text: 'The patient is notified and visits the lab. The lab sends its results back as FHIR resources, and they are filed in the EHR.',
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
        <Architecture />
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

// ── Architecture: a business-level version of the README's flowchart ──
// People on the left, the WSO2 integration in the middle, the systems of record on the right. One accent colour
// marks what the demo is about: the AI agents and the Ballerina FHIR connectors; everything else stays neutral.
// It is HTML, not an image, so it reads at phone width (columns stack, connectors turn vertical) and in dark mode.

const PEOPLE: { icon: LucideIcon; who: string; app: string; does: string }[] = [
  { icon: Stethoscope, who: 'Physician', app: 'Physician workspace', does: 'Reviews the record, orders labs, releases results' },
  { icon: HeartPulse, who: 'Patient', app: 'Patient app', does: 'Gets lab instructions and reads the report' },
  { icon: Microscope, who: 'Lab team', app: 'Lab console', does: 'Collects the specimen, releases results' },
]

const SYSTEMS: { icon: LucideIcon; name: string; detail: string; does: string }[] = [
  { icon: Database, name: 'EHR', detail: 'FHIR R4 server', does: 'Patient history, orders of record, results and notes' },
  { icon: FlaskConical, name: 'Reference lab', detail: 'FHIR R4 server', does: 'Orders, specimens and results' },
]

const AGENTS: { name: string; does: string }[] = [
  { name: 'Diagnostic Copilot', does: 'Reviews the patient’s record' },
  { name: 'Results Analyst', does: 'Reads new results against years of history' },
  { name: 'Care Plan Writer', does: 'Drafts the care plan and the patient report' },
]

const CONNECTORS: { name: string; does: string }[] = [
  { name: 'EHR', does: 'Reads the record; writes the visit, order, results and signed note' },
  { name: 'Lab', does: 'Sends the order; receives specimens and results as FHIR messages' },
]

function Architecture() {
  return (
    <section aria-labelledby="architecture-title">
      <SectionTitle eyebrow="What we built" title="AI agents and FHIR, in one integration" id="architecture-title"
        text="The apps talk only to the integration. Ballerina FHIR connectors keep the EHR and the lab in step; AI agents read the data and draft the analysis, and the physician decides." />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_76px_minmax(0,2.15fr)_76px_minmax(0,0.85fr)]">
        <ArchColumn title="People">
          {PEOPLE.map((p) => <ArchCard key={p.who} icon={p.icon} title={p.who} tag={p.app} text={p.does} />)}
        </ArchColumn>
        <ArchLink label="Tasks & approvals" />
        <IntegrationLayer />
        <ArchLink label="FHIR R4" />
        <ArchColumn title="Systems of record">
          {SYSTEMS.map((s) => <ArchCard key={s.name} icon={s.icon} title={s.name} tag={s.detail} text={s.does} />)}
        </ArchColumn>
      </div>
    </section>
  )
}

function ArchColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="eyebrow text-center text-ink-muted">{title}</p>
      {/* Natural-height cards, centred against the taller integration. */}
      <div className="flex flex-col gap-3 lg:flex-1 lg:justify-center">{children}</div>
    </div>
  )
}

function ArchCard({ icon: Icon, title, tag, text }: { icon: LucideIcon; title: string; tag: string; text: string }) {
  return (
    <div className="card flex gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-soft"><Icon size={18} /></span>
      <div className="min-w-0">
        <p className="font-semibold leading-tight text-ink">{title}</p>
        <p className="text-[11px] text-ink-muted">{tag}</p>
        <p className="mt-1 text-[13px] leading-snug text-ink-soft">{text}</p>
      </div>
    </div>
  )
}

// A two-way connector: horizontal between the columns on wide screens, vertical when they stack.
function ArchLink({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-1 lg:py-0" aria-hidden>
      <div className="flex flex-col items-center lg:hidden">
        <ChevronUp size={14} className="-mb-1 text-brand" />
        <span className="flow-line-v h-4 w-0.5" />
        <span className="my-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">{label}</span>
        <span className="flow-line-v h-4 w-0.5" />
        <ChevronDown size={14} className="-mt-1 text-brand" />
      </div>
      <div className="hidden w-full flex-col items-center gap-1.5 lg:flex">
        <span className="text-center text-[11px] font-medium leading-tight text-ink-soft">{label}</span>
        <div className="flex w-full items-center">
          <ChevronLeft size={14} className="-mr-1 shrink-0 text-brand" />
          <span className="flow-line h-0.5 flex-1" />
          <ChevronRight size={14} className="-ml-1 shrink-0 text-brand" />
        </div>
      </div>
    </div>
  )
}

function Highlight({ icon: Icon, title, subtitle, children }: { icon: LucideIcon; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-brand/30 bg-brand-soft/50 p-4">
      <p className="flex items-center gap-2 font-semibold text-ink"><Icon size={17} className="text-brand" /> {title}</p>
      <p className="mt-0.5 text-[12px] text-ink-muted">{subtitle}</p>
      {children}
    </div>
  )
}

function IntegrationLayer() {
  return (
    <div className="flex flex-col gap-3">
      <p className="eyebrow text-center text-ink-muted">Integration</p>
      <div className="card flex flex-1 flex-col gap-3 p-4 ring-1 ring-brand/20 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-lg font-semibold tracking-tight text-ink">WSO2 integration</p>
          <p className="text-[12px] text-ink-muted">Ballerina · WSO2 Integrator</p>
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px] leading-snug text-ink-soft">
          <Workflow size={15} className="mt-0.5 shrink-0 text-ink-muted" />
          <span><span className="font-medium text-ink">Durable care workflow</span> — tracks every step, waits days for the patient and the lab, retries, then asks a person.</span>
        </p>
        <div className="grid flex-1 gap-3 md:grid-cols-[1.15fr_1fr]">
          <Highlight icon={Sparkles} title="AI agents" subtitle="They draft; the physician decides">
            <ul className="mt-3 space-y-2">
              {AGENTS.map((a) => (
                <li key={a.name} className="text-[13px] leading-snug">
                  <span className="font-medium text-ink">{a.name}</span>
                  <span className="text-ink-soft"> — {a.does}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto space-y-1.5 pt-4"><div className="space-y-1.5 border-t border-brand/20 pt-3 text-[12px] leading-snug text-ink-soft">
              <p className="flex items-start gap-1.5"><Plug size={13} className="mt-0.5 shrink-0 text-ink-muted" /> Tools: FHIR MCP servers for the EHR and the lab, PubMed for evidence</p>
              <p className="flex items-start gap-1.5"><ShieldCheck size={13} className="mt-0.5 shrink-0 text-ink-muted" /> Governed by WSO2 Agent Manager: identity, AI gateway, traces</p>
            </div></div>
          </Highlight>
          <Highlight icon={Cable} title="Ballerina FHIR connectors" subtitle="Typed FHIR R4 resources, one connector per system">
            <ul className="mt-3 flex flex-1 flex-col gap-2">
              {CONNECTORS.map((c) => (
                <li key={c.name} className="flex flex-1 flex-col justify-center rounded-lg border border-brand/20 bg-surface px-3 py-2">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">{c.name} <ChevronRight size={13} className="text-brand" /></span>
                  <span className="text-[12px] leading-snug text-ink-soft">{c.does}</span>
                </li>
              ))}
            </ul>
          </Highlight>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ eyebrow, title, text, id }: { eyebrow?: string; title: string; text?: string; id?: string }) {
  return (
    <div className="mx-auto mb-8 max-w-2xl text-center">
      {eyebrow && <p className="eyebrow mb-2 text-brand-ink">{eyebrow}</p>}
      <h2 id={id} className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
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
