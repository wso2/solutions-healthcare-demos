import { useEffect, useState, useSyncExternalStore } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ChevronRight, HeartPulse, LogIn, LogOut, ShieldCheck } from 'lucide-react'
import {
  beginLogin, completeLogin, getSession, loadAuthConfig, logout, onSessionChange,
  type PatientAuthConfig,
} from '../lib/smartAuth'
import { Avatar, ErrorNote, Spinner } from '../components/ui'
import { SmartTracePanel, useTracePanelOpen } from '../components/SmartTracePanel'
import { initials } from '../lib/format'

// SMART on FHIR sign-in screens for the patient app. See lib/smartAuth.ts for the flow.

function useAuthConfig() {
  const [config, setConfig] = useState<PatientAuthConfig>()
  useEffect(() => void loadAuthConfig().then(setConfig), [])
  return config
}

export function usePatientSession() {
  return useSyncExternalStore(onSessionChange, getSessionSnapshot)
}

// useSyncExternalStore needs a stable snapshot: re-read storage only when the session changes.
let snapshot = getSession()
onSessionChange(() => (snapshot = getSession()))
const getSessionSnapshot = () => snapshot

/** Wraps the patient app's pages: with SMART sign-in enabled, nothing renders until the patient has a token. */
export function RequirePatientSignIn() {
  const config = useAuthConfig()
  const session = usePatientSession()
  const { pathname } = useLocation()
  const [panelOpen, setPanelOpen] = useTracePanelOpen()
  if (!config) return <div className="flex justify-center py-20 text-ink-muted"><Spinner size={22} /></div>
  if (!config.enabled) return <Outlet />
  const page = session ? <Outlet /> : <SignIn config={config} />
  // The landing page carries the SMART traffic panel; the content makes room for it on wide screens.
  if (pathname.replace(/\/$/, '') !== '/patient') return page
  return (
    <>
      <div className={panelOpen ? 'xl:pr-[440px]' : ''}>{page}</div>
      <SmartTracePanel open={panelOpen} onToggle={() => setPanelOpen(!panelOpen)} />
    </>
  )
}

function SignIn({ config }: { config: PatientAuthConfig }) {
  const location = useLocation()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<string | boolean>(false)

  const [choosing, setChoosing] = useState(false)
  const users = config.demoUsers ?? []

  // Starts the SMART authorize flow. The user is only a reminder of what to type: nothing is pre-filled, so
  // the patient enters the credentials on the APIM login page and approves the consent screen themselves.
  const signIn = async (username?: string) => {
    setBusy(username ?? true)
    setError(undefined)
    try {
      await beginLogin(location.pathname + location.search)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 pt-6">
      <div className="card space-y-5 px-6 py-7 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand-ink"><HeartPulse size={24} /></span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Sign in to see your health assessment</h1>
          <p className="mt-1 text-sm text-ink-muted">You will sign in with your Healthspan account, then come back here.</p>
        </div>
        {!choosing && (
          <button
            type="button"
            className="btn-primary w-full justify-center"
            disabled={busy !== false}
            onClick={() => (users.length ? setChoosing(true) : void signIn())}
          >
            {busy ? <Spinner /> : <LogIn size={16} />} Sign in
          </button>
        )}
        {choosing && (
          <div className="space-y-2 text-left">
            <p className="text-xs text-ink-muted">
              Patients registered in API Manager. Pick one, then enter its username and password on the sign-in page.
            </p>
            <ul className="space-y-2">
              {users.map((u) => (
                <li key={u.username}>
                  <button
                    type="button"
                    disabled={busy !== false}
                    onClick={() => void signIn(u.username)}
                    className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition hover:border-brand hover:bg-brand-soft/40 disabled:opacity-60"
                  >
                    <Avatar text={initials(u.name)} className="h-9 w-9 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{u.name}</span>
                      <span className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-xs text-ink-muted">
                        <span>user <span className="text-ink">{u.username}</span></span>
                        <span>password <span className="text-ink">{u.password}</span></span>
                      </span>
                    </span>
                    {busy === u.username ? <Spinner /> : <ChevronRight size={16} className="text-ink-muted" />}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-ghost w-full justify-center text-xs" onClick={() => setChoosing(false)} disabled={busy !== false}>
              Cancel
            </button>
          </div>
        )}
        {error && <div className="text-left"><ErrorNote message={error} /></div>}
      </div>
      <details className="rounded-lg border border-line px-4 py-3 text-xs text-ink-muted">
        <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-ink"><ShieldCheck size={14} /> SMART on FHIR details</summary>
        <dl className="mt-3 space-y-2 break-all">
          <Row label="Issuer (aud)" value={config.iss} />
          <Row label="Discovery" value={`${config.iss}/.well-known/smart-configuration`} />
          <Row label="API gateway" value={config.apiBase} />
          <Row label="Client ID" value={config.clientId} />
          <Row label="Scopes" value={config.scope} />
        </dl>
      </details>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-ink">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  )
}

// One exchange per callback URL: StrictMode runs effects twice, and the code is single-use.
const exchanges = new Map<string, Promise<string>>()

/** /patient/callback: the authorization server sends the browser back here with ?code&state. */
export function PatientCallback() {
  const { search } = useLocation()
  const [next, setNext] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let exchange = exchanges.get(search)
    if (!exchange) {
      exchange = completeLogin(search)
      exchanges.set(search, exchange)
    }
    exchange.then(setNext, (e: Error) => setError(e.message))
  }, [search])

  if (next) return <Navigate to={next} replace />
  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-6">
        <ErrorNote message={error} />
        <a href="/patient" className="btn-ghost">Back to sign-in</a>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-sm text-ink-muted">
      <Spinner size={22} /> Signing you in…
    </div>
  )
}

/** Signed-in user and sign-out, for the patient app's header. */
export function PatientAccount() {
  const session = usePatientSession()
  if (!session) return null
  return (
    <div className="flex items-center gap-1">
      {session.user && <span className="hidden max-w-[12rem] truncate text-xs text-ink-muted sm:inline">{session.user}</span>}
      <button type="button" className="btn-ghost px-2" aria-label="Sign out" title="Sign out" onClick={() => void logout()}>
        <LogOut size={16} />
      </button>
    </div>
  )
}
