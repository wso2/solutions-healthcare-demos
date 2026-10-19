import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Activity, FlaskConical, HeartPulse, Moon, Stethoscope, Sun, type LucideIcon } from 'lucide-react'
import { loadSystem } from '../lib/useSystem'
import { usePolling } from '../lib/usePolling'

// One app per browser tab: the header names the app and links only to its own start page.

export type AppKey = 'physician' | 'patient' | 'lab'

export const APPS: Record<AppKey, { to: string; title: string; icon: LucideIcon; color: string }> = {
  physician: { to: '/physician', title: 'Physician workspace', icon: Stethoscope, color: 'rgb(var(--physician))' },
  patient: { to: '/patient', title: 'Patient app', icon: HeartPulse, color: 'rgb(var(--brand))' },
  lab: { to: '/lab', title: 'Lab console', icon: FlaskConical, color: 'rgb(var(--lab))' },
}

export function AppShell({ app }: { app: AppKey }) {
  const { to, title, icon: Icon, color } = APPS[app]
  useEffect(() => {
    document.title = `${title} · Healthspan`
  }, [title])
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Link to={to} className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: color }}>
              <Icon size={17} strokeWidth={2.3} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight text-ink">{title}</span>
              <span className="block text-[11px] text-ink-muted">Healthspan</span>
            </span>
          </Link>
          <HealthIndicator />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 pb-20 pt-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}

export function BrandMark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white dark:text-canvas">
        <Activity size={18} strokeWidth={2.4} />
      </span>
      <span className="text-sm font-semibold tracking-tight text-ink">Healthspan</span>
    </span>
  )
}

/**
 * What the demo depends on, checked every 15 s: the integration itself, each EHR and the model
 * configuration. The dot carries a word beside it, never colour alone.
 */
export function HealthIndicator() {
  const { data: system, error } = usePolling(() => loadSystem(true), 15000)
  const checks = system
    ? [
        { label: 'Integration', ok: true },
        ...system.ehrs.map((e) => ({ label: `${e.name} FHIR`, ok: e.reachable })),
        { label: 'AI model', ok: system.model.configured },
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
      <div className="invisible absolute right-0 top-full z-40 mt-1 w-60 rounded-lg border border-line bg-surface p-2 text-xs opacity-0 shadow-pop transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
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
export function ThemeToggle() {
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
