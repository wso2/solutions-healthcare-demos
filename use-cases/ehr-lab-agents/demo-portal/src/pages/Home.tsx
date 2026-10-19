import { Link } from 'react-router-dom'
import { ArrowRight, Bot, CircleDollarSign, Database, EyeOff, Fingerprint, FileLock2, FlaskConical, Gauge, GitBranch, HeartPulse, LayoutDashboard, ShieldCheck, Stethoscope } from 'lucide-react'

// Landing page: what the demo is, how the pieces connect, and the three ways in.

const entries = [
  { to: '/physician', icon: Stethoscope, title: 'Physician workspace', text: 'Pick Cerner or Athena, open a patient’s summary, explore their records, evaluate them with the Copilot, order labs, review and release.' },
  { to: '/patient', icon: HeartPulse, title: 'Patient app', text: 'Where the patient is told to go to the lab, follows progress, and reads the report once the physician releases it.' },
  { to: '/lab', icon: FlaskConical, title: 'Lab console', text: 'Presenter tool playing the reference lab: collect the specimen, release results, and watch the workflow resume.' },
  { to: '/agent-manager', icon: ShieldCheck, title: 'Agent Manager', text: 'How the agents are governed: identity and permissions, FHIR de-identification, budgets and cost, guardrails and evaluation.' },
]

// What WSO2 Agent Manager puts between the agents and everything they touch.
const controls = [
  { icon: Fingerprint, label: 'AgentID', sub: 'an identity and roles per agent' },
  { icon: FileLock2, label: 'MCP proxies', sub: 'role-scoped tools · FHIR de-identified' },
  { icon: CircleDollarSign, label: 'AI gateway', sub: 'per-agent budgets and cost' },
  { icon: EyeOff, label: 'PHI guardrail', sub: 'identifiers redacted before Claude' },
  { icon: Gauge, label: 'Traces & evaluation', sub: 'every run scored' },
]

const flow = [
  { icon: Database, label: 'Cerner · Athena', sub: 'EHRs over FHIR R4', color: 'rgb(var(--ehr))' },
  { icon: GitBranch, label: 'Integration', sub: 'Ballerina · Temporal', color: 'rgb(var(--brand))' },
  { icon: Bot, label: '3 agents', sub: 'Copilot · Analysis · Care plan', color: 'rgb(var(--ai))' },
  { icon: FlaskConical, label: 'Quest Labs', sub: 'FHIR R4', color: 'rgb(var(--lab))' },
  { icon: LayoutDashboard, label: 'Longevity record', sub: 'Physician & patient apps', color: 'rgb(var(--physician))' },
]

export function Home() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 py-6">
      <section className="text-center">
        <p className="text-sm font-medium text-brand-ink">EHR + biomarkers · agentic integration demo</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
          Connect EHR history with lab biomarkers to catch risk early
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          A durable workflow pulls the record from the patient's EHR, the physician evaluates it with an AI Copilot and orders
          labs, waits on the patient and the lab, and AI agents analyse the results for the physician to review and release.
        </p>
      </section>

      <section className="card px-6 py-6">
        <ol className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
          {flow.map(({ icon: Icon, label, sub, color }, i) => (
            <li key={label} className="flex flex-1 items-center gap-3 md:flex-col md:text-center">
              <div className="flex items-center gap-3 md:flex-col">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-card" style={{ background: color }}>
                  <Icon size={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{label}</p>
                  <p className="text-xs text-ink-muted">{sub}</p>
                </div>
              </div>
              {i < flow.length - 1 && <ArrowRight size={16} className="ml-auto text-ink-muted md:hidden" />}
            </li>
          ))}
        </ol>
        <div className="mt-5 rounded-xl border border-ai/25 bg-ai-soft/50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ai-ink">
            <ShieldCheck size={14} /> Governed by WSO2 Agent Manager — between the agents and the EHRs, PubMed and Claude
          </p>
          <ul className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {controls.map(({ icon: Icon, label, sub }) => (
              <li key={label} className="flex items-start gap-2">
                <Icon size={16} className="mt-0.5 shrink-0 text-ai-ink" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{label}</span>
                  <span className="block text-xs text-ink-muted">{sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {entries.map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} className="card group flex flex-col gap-3 p-5 transition hover:shadow-pop">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand-ink"><Icon size={19} /></span>
            <h2 className="font-semibold text-ink">{title}</h2>
            <p className="flex-1 text-sm leading-relaxed text-ink-soft">{text}</p>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink">
              Open <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>
    </div>
  )
}
