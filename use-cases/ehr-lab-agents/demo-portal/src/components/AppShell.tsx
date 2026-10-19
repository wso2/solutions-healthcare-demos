import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Activity, FlaskConical, HeartPulse, Moon, ShieldCheck, Stethoscope, Sun } from 'lucide-react'
import { loadSystem } from '../lib/useSystem'
import { usePolling } from '../lib/usePolling'
import { PresenterGuide } from './PresenterGuide'

const nav = [
  { to: '/physician', label: 'Physician', icon: Stethoscope },
  { to: '/patient', label: 'Patient app', icon: HeartPulse },
  { to: '/lab', label: 'Lab console', icon: FlaskConical },
  { to: '/agent-manager', label: 'Agent Manager', icon: ShieldCheck },
]

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white dark:text-canvas">
              <Activity size={18} strokeWidth={2.4} />
            </span>
            <span className="hidden text-sm font-semibold tracking-tight text-ink sm:block">Healthspan Workspace</span>
          </Link>
          <nav className="flex items-center gap-1">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive ? 'bg-brand-soft text-brand-ink' : 'text-ink-soft hover:bg-sunken hover:text-ink'
                  }`
                }
              >
                <Icon size={16} />
                <span className="hidden md:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <HealthIndicator />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 pb-20 pt-6 sm:px-6">{children}</main>
      <PresenterGuide />
    </div>
  )
}

/**
 * What the demo depends on, checked every 15 s: the integration itself, each EHR, the model configuration
 * and Agent Manager. The dot carries a word beside it, never colour alone.
 */
function HealthIndicator() {
  const { data: system, error } = usePolling(() => loadSystem(true), 15000)
  const checks = system
    ? [
        { label: 'Integration (WSO2 · Ballerina)', ok: true },
        ...system.ehrs.map((e) => ({ label: `${e.name} FHIR`, ok: e.reachable })),
        { label: `Model · ${system.model.name}`, ok: system.model.configured },
        { label: 'WSO2 Agent Manager', ok: system.agentManager.enabled },
      ]
    : []
  const down = error ? 1 : checks.filter((c) => !c.ok).length
  const state = !system && !error ? 'checking' : error ? 'down' : down ? 'degraded' : 'ok'
  const dot = { checking: 'bg-line', ok: 'bg-good', degraded: 'bg-watch', down: 'bg-act' }[state]
  const word = { checking: 'Checking…', ok: 'All systems up', degraded: `${down} system${down === 1 ? '' : 's'} down`, down: 'Integration unreachable' }[state]
  return (
    <div className="group relative ml-auto">
      <button type="button" className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-sunken hover:text-ink" aria-label={`System status: ${word}`}>
        <span className={`h-2 w-2 rounded-full ${dot} ${state === 'down' ? 'animate-pulse' : ''}`} aria-hidden />
        <span className="hidden lg:inline">{word}</span>
      </button>
      <div className="invisible absolute right-0 top-full z-40 mt-1 w-64 rounded-lg border border-line bg-surface p-2 text-xs opacity-0 shadow-pop transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        {error && <p className="px-1 py-1 text-act-ink">The integration API does not answer: {error}</p>}
        <ul className="space-y-1">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center justify-between gap-2 px-1">
              <span className="truncate text-ink">{c.label}</span>
              <span className={`shrink-0 ${c.ok ? 'text-good-ink' : 'text-act-ink'}`}>{c.ok ? 'up' : 'down'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Light/dark switch. The choice is a per-viewer convenience, so browser storage is fine for it. */
function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme')
      if (saved === 'light' || saved === 'dark') return saved
    } catch {
      /* storage unavailable */
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])
  return (
    <button type="button" className="btn-ghost px-2" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
