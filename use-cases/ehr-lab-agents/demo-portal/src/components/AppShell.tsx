import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Activity, FlaskConical, HeartPulse, Moon, ShieldCheck, Stethoscope, Sun } from 'lucide-react'

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
          <div className="ml-auto hidden items-center gap-2 text-xs text-ink-muted lg:flex">
            <span className="h-2 w-2 rounded-full bg-good" aria-hidden />
            Integration by WSO2 · Ballerina
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
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
    <button type="button" className="btn-ghost ml-2 px-2 lg:ml-0" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
