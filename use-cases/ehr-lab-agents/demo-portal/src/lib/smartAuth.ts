// SMART on FHIR sign-in for the patient app (standalone launch, public client, PKCE).
//
// WSO2 API Manager sits in front of the integration's patient-app endpoints. The app:
//   1. reads its settings from /patient-auth.json — config/patient-auth.json, served by nginx (container) or
//      Vite (npm run dev) and read on every page load, so switching modes needs no rebuild or restart,
//   2. discovers the OAuth endpoints from {iss}/.well-known/smart-configuration,
//   3. sends the browser to the authorization endpoint (the patient signs in with their APIM user),
//   4. exchanges the code for a token at the APIM token endpoint, and
//   5. calls the patient-app API on the APIM gateway with "Authorization: Bearer <token>".
//
// "mode" switches the patient app (scripts/patient-app-mode.sh): "smart" signs in as above; "normal" (the default,
// and the fallback when the file is missing or SMART settings are incomplete) calls the integration directly.

export type PatientAppMode = 'smart' | 'normal'

export interface PatientAuthConfig {
  mode: PatientAppMode
  /** True in SMART mode with a client ID: the app signs in and calls the API through APIM. */
  enabled: boolean
  /** FHIR base URL (SMART "iss"); discovery reads {iss}/.well-known/smart-configuration. Also sent as `aud`. */
  iss: string
  /** Base URL of the patient-app API on the APIM gateway; it maps to the integration's /api. */
  apiBase: string
  /** The client ID of the patient app's APIM application (a public client with PKCE). */
  clientId: string
  scope: string
  /** Defaults to {origin}/patient/callback; it must match the callback URL registered on the APIM application. */
  redirectUri?: string
  /**
   * Demo only: the patient users scripts/apim-setup.sh registered in APIM, shown on the sign-in screen so the
   * presenter knows what to type on the APIM login page. Nothing here is sent anywhere by the app.
   */
  demoUsers?: DemoUser[]
}

export interface DemoUser {
  username: string
  password: string
  name: string
  patientId: string
}

export interface SmartConfiguration {
  authorization_endpoint: string
  token_endpoint: string
  revocation_endpoint?: string
  end_session_endpoint?: string
  code_challenge_methods_supported?: string[]
  scopes_supported?: string[]
  capabilities?: string[]
}

export interface PatientSession {
  accessToken: string
  tokenType: string
  /** Epoch milliseconds. */
  expiresAt: number
  refreshToken?: string
  idToken?: string
  scope?: string
  /** SMART launch context: the FHIR Patient id the token is bound to, when the server returns one. */
  patient?: string
  /** Name of the signed-in user, from the ID token when there is one. */
  user?: string
}

import { addEntry, completeEntry, paramsOf, tracedFetch } from './smartTrace'

const SESSION_KEY = 'patient-app.session'
const PENDING_KEY = 'patient-app.pending-login'
const DISABLED: PatientAuthConfig = { mode: 'normal', enabled: false, iss: '', apiBase: '/api', clientId: '', scope: '' }

// ── Config and discovery ────────────────────────────────────────────────────

let configPromise: Promise<PatientAuthConfig> | undefined

export function loadAuthConfig(): Promise<PatientAuthConfig> {
  configPromise ??= fetch('/patient-auth.json', { cache: 'no-store' })
    .then(async (r): Promise<Partial<PatientAuthConfig>> => (r.ok ? await r.json() : {}))
    .catch((): Partial<PatientAuthConfig> => ({}))
    .then((raw) => {
      // "enabled": true is the older spelling of "mode": "smart".
      const mode: PatientAppMode = raw.mode === 'smart' || (!raw.mode && raw.enabled === true) ? 'smart' : 'normal'
      const c = { ...DISABLED, ...raw, mode }
      const enabled = mode === 'smart' && !!c.clientId && !!c.iss && !c.clientId.startsWith('<')
      if (mode === 'smart' && !enabled) console.warn('patient-auth.json: SMART mode needs iss and clientId (scripts/apim-setup.sh); using normal mode')
      return { ...c, enabled, iss: trimSlash(c.iss), apiBase: trimSlash(c.apiBase || '/api') }
    })
  return configPromise
}

/**
 * Reads {iss}/.well-known/smart-configuration. Not cached: each sign-in, refresh and sign-out discovers the
 * endpoints afresh, so every flow shows its discovery call in the SMART traffic panel.
 */
export async function discover(iss: string): Promise<SmartConfiguration> {
  const url = `${iss}/.well-known/smart-configuration`
  const response = await tracedFetch('discovery', 'SMART discovery', url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`SMART discovery failed at ${url} (HTTP ${response.status})`)
  const body = (await response.json()) as SmartConfiguration
  if (!body.authorization_endpoint || !body.token_endpoint) {
    throw new Error('The SMART configuration has no authorization_endpoint or token_endpoint')
  }
  return body
}

const redirectUriOf = (config: PatientAuthConfig) => config.redirectUri || `${window.location.origin}/patient/callback`

// ── Authorize ───────────────────────────────────────────────────────────────

interface PendingLogin {
  traceId?: string
  state: string
  codeVerifier: string
  returnTo: string
  tokenEndpoint: string
  redirectUri: string
}

/** Sends the browser to the APIM authorization endpoint. Resolves only if it fails before navigating. */
export async function beginLogin(returnTo: string): Promise<void> {
  const config = await loadAuthConfig()
  const smart = await discover(config.iss)
  const methods = smart.code_challenge_methods_supported
  if (methods && !methods.includes('S256')) throw new Error('The authorization server does not support PKCE with S256')

  const state = randomString(32)
  const codeVerifier = randomString(64)
  const redirectUri = redirectUriOf(config)

  const url = new URL(smart.authorization_endpoint)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: config.scope,
    state,
    aud: config.iss,
    code_challenge: await sha256Base64Url(codeVerifier),
    code_challenge_method: 'S256',
    // Always show the APIM login page: APIM's SMART configuration lists no end_session_endpoint, so its login
    // session outlives "Sign out" and would otherwise sign the previous patient straight back in.
    prompt: 'login',
  }).toString()
  // A browser navigation, not a fetch: the response is the redirect back to /patient/callback (completeLogin).
  const traceId = addEntry('authorize', 'Authorization request', {
    method: 'GET',
    url: smart.authorization_endpoint,
    body: paramsOf(url.toString()),
    note: `Browser redirect. PKCE: code_verifier=${codeVerifier} (kept in the tab), code_challenge=SHA-256(code_verifier).`,
  })
  const pending: PendingLogin = { traceId, state, codeVerifier, returnTo, tokenEndpoint: smart.token_endpoint, redirectUri }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  window.location.assign(url.toString())
}

// ── Callback and token ──────────────────────────────────────────────────────

/** Handles /patient/callback: checks the state, exchanges the code, stores the session. Returns where to go next. */
export async function completeLogin(search: string): Promise<string> {
  const params = new URLSearchParams(search)
  const raw = sessionStorage.getItem(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)

  const pending = raw ? (JSON.parse(raw) as PendingLogin) : undefined
  if (pending?.traceId) {
    completeEntry(pending.traceId, {
      status: 302,
      statusText: 'Found',
      url: `${window.location.origin}${window.location.pathname}`,
      body: paramsOf(window.location.href),
      note: 'The patient signed in on the APIM login page and approved the consent page; APIM redirected the browser back to the redirect_uri.',
    })
  }
  const error = params.get('error')
  if (error) throw new Error(`Sign-in failed: ${params.get('error_description') || error}`)
  if (!pending) throw new Error('No sign-in is in progress in this tab. Start again.')
  if (params.get('state') !== pending.state) throw new Error('Sign-in failed: the state does not match. Start again.')
  const code = params.get('code')
  if (!code) throw new Error('Sign-in failed: the authorization server returned no code.')

  const config = await loadAuthConfig()
  const token = await tokenRequest('token', pending.tokenEndpoint, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    client_id: config.clientId,
    code_verifier: pending.codeVerifier,
  })
  saveSession(toSession(token))
  return pending.returnTo || '/patient'
}

interface TokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  id_token?: string
  scope?: string
  patient?: string
}

async function tokenRequest(kind: 'token' | 'refresh', tokenEndpoint: string, form: Record<string, string>): Promise<TokenResponse> {
  const title = kind === 'token' ? 'Token request (authorization code + PKCE)' : 'Token refresh'
  const response = await tracedFetch(kind, title, tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(form).toString(),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.access_token) {
    throw new Error(`Token request failed (HTTP ${response.status}): ${body.error_description || body.error || response.statusText}`)
  }
  return body as TokenResponse
}

function toSession(token: TokenResponse, previous?: PatientSession): PatientSession {
  const claims = token.id_token ? decodeJwt(token.id_token) : {}
  return {
    accessToken: token.access_token,
    tokenType: token.token_type || 'Bearer',
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    refreshToken: token.refresh_token ?? previous?.refreshToken,
    idToken: token.id_token ?? previous?.idToken,
    scope: token.scope ?? previous?.scope,
    patient: token.patient ?? (typeof claims.patient === 'string' ? claims.patient : undefined) ?? previous?.patient,
    user: str(claims.name) ?? str(claims.preferred_username) ?? str(claims.sub) ?? previous?.user,
  }
}

// ── Session ─────────────────────────────────────────────────────────────────

const listeners = new Set<() => void>()
export function onSessionChange(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function getSession(): PatientSession | undefined {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as PatientSession) : undefined
  } catch {
    return undefined
  }
}

function saveSession(session: PatientSession | undefined) {
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  else sessionStorage.removeItem(SESSION_KEY)
  listeners.forEach((l) => l())
}

let refreshing: Promise<PatientSession | undefined> | undefined

/** A valid access token, refreshed when it is about to expire; undefined when the patient must sign in again. */
export async function accessToken(): Promise<string | undefined> {
  const session = getSession()
  if (!session) return undefined
  if (session.expiresAt - Date.now() > 30_000) return session.accessToken
  if (!session.refreshToken) {
    saveSession(undefined)
    return undefined
  }
  refreshing ??= (async () => {
    try {
      const config = await loadAuthConfig()
      const smart = await discover(config.iss)
      const token = await tokenRequest('refresh', smart.token_endpoint, {
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken!,
        client_id: config.clientId,
      })
      const next = toSession(token, session)
      saveSession(next)
      return next
    } catch {
      saveSession(undefined)
      return undefined
    } finally {
      refreshing = undefined
    }
  })()
  return (await refreshing)?.accessToken
}

/** The gateway rejected the token: forget it so the app asks the patient to sign in again. */
export function sessionRejected() {
  saveSession(undefined)
}

export async function logout() {
  const session = getSession()
  saveSession(undefined)
  const config = await loadAuthConfig()
  if (!config.enabled || !session) return
  const smart = await discover(config.iss).catch(() => undefined)
  if (smart?.revocation_endpoint) {
    await tracedFetch('revoke', 'Token revocation', smart.revocation_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: session.accessToken, token_type_hint: 'access_token', client_id: config.clientId }).toString(),
    }).catch(() => undefined)
  }
  if (smart?.end_session_endpoint) {
    const url = new URL(smart.end_session_endpoint)
    url.search = new URLSearchParams({
      ...(session.idToken ? { id_token_hint: session.idToken } : {}),
      post_logout_redirect_uri: `${window.location.origin}/patient`,
      client_id: config.clientId,
    }).toString()
    addEntry('logout', 'End session', { method: 'GET', url: smart.end_session_endpoint, body: paramsOf(url.toString()), note: 'Browser redirect.' })
    window.location.assign(url.toString())
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function trimSlash(s: string) {
  return s.replace(/\/+$/, '')
}

function str(v: unknown) {
  return typeof v === 'string' && v ? v : undefined
}

function randomString(bytes: number) {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

async function sha256Base64Url(text: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
}

function base64Url(bytes: Uint8Array) {
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeJwt(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='))
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))))
  } catch {
    return {}
  }
}
