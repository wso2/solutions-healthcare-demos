// A record of the patient app's SMART on FHIR traffic — discovery, authorize, token, API calls, revoke — for the
// side panel on the patient app's landing page. Kept in sessionStorage so it survives the redirect through the
// APIM login and consent pages. Demo aid: it shows tokens as they are.

export type TraceKind = 'discovery' | 'authorize' | 'token' | 'refresh' | 'api' | 'revoke' | 'logout'

export interface TraceMessage {
  method?: string
  url?: string
  status?: number
  statusText?: string
  headers?: Record<string, string>
  body?: string
  /** Free text where there is no HTTP body to show (e.g. the redirect back to the app). */
  note?: string
}

export interface TraceEntry {
  id: string
  kind: TraceKind
  title: string
  startedAt: number
  endedAt?: number
  request: TraceMessage
  response?: TraceMessage
  error?: string
}

const KEY = 'patient-app.trace'
const MAX = 100

let entries: TraceEntry[] = load()
const listeners = new Set<() => void>()

function load(): TraceEntry[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as TraceEntry[]
  } catch {
    return []
  }
}

function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    /* storage full or unavailable: keep the in-memory list */
  }
  listeners.forEach((l) => l())
}

export function subscribeTrace(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const traceSnapshot = () => entries

export function clearTrace() {
  entries = []
  save()
}

export function addEntry(kind: TraceKind, title: string, request: TraceMessage): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  entries = [...entries, { id, kind, title, startedAt: Date.now(), request }].slice(-MAX)
  save()
  return id
}

export function completeEntry(id: string, response: TraceMessage | undefined, error?: string) {
  const entry = entries.find((e) => e.id === id)
  if (!entry) return
  const done: TraceEntry = { ...entry, response, error, endedAt: Date.now() }
  // The app polls its API: an API call identical to one already listed since the last sign-in step (same request,
  // token and response) is not listed again; the existing entry just takes the latest timing. Sign-in steps —
  // discovery, authorize, token, refresh, revoke — are always listed, in order.
  const since = entries.slice(lastFlowStep(id) + 1)
  const same = done.kind === 'api' ? since.find((e) => e.id !== id && e.endedAt && signature(e) === signature(done)) : undefined
  entries = same
    ? entries.filter((e) => e.id !== id).map((e) => (e === same ? { ...e, startedAt: done.startedAt, endedAt: done.endedAt } : e))
    : entries.map((e) => (e.id === id ? done : e))
  save()
}

/** Index of the newest sign-in step (anything but an API call) other than `id`, or -1. */
function lastFlowStep(id: string) {
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i].kind !== 'api' && entries[i].id !== id) return i
  return -1
}

const signature = (e: TraceEntry) =>
  JSON.stringify([e.kind, e.request.method, e.request.url, e.request.headers?.Authorization, e.response?.status, e.response?.body, e.error])

/** fetch() that records the request and the response in the trace. */
export async function tracedFetch(kind: TraceKind, title: string, url: string, init: RequestInit = {}): Promise<Response> {
  const id = addEntry(kind, title, {
    method: init.method ?? 'GET',
    url,
    headers: headersOf(init.headers),
    body: typeof init.body === 'string' ? prettyBody(init.body, headersOf(init.headers)['Content-Type']) : undefined,
  })
  try {
    const response = await fetch(url, init)
    const text = await response.clone().text()
    completeEntry(id, {
      status: response.status,
      statusText: response.statusText,
      headers: headersOf(response.headers),
      body: prettyBody(text, response.headers.get('content-type') ?? undefined),
    })
    return response
  } catch (err) {
    completeEntry(id, undefined, `${err instanceof Error ? err.message : String(err)} (network error, CORS, or an untrusted certificate)`)
    throw err
  }
}

function headersOf(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!h) return out
  new Headers(h).forEach((v, k) => (out[k.replace(/(^|-)\w/g, (m) => m.toUpperCase())] = v))
  return out
}

function prettyBody(text: string, contentType?: string): string {
  if (!text) return ''
  if (contentType?.includes('x-www-form-urlencoded')) {
    return [...new URLSearchParams(text)].map(([k, v]) => `${k}=${v}`).join('\n')
  }
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** Query parameters of a URL, one per line, for showing an authorize request or a redirect. */
export function paramsOf(url: string): string {
  return [...new URL(url).searchParams].map(([k, v]) => `${k}=${v}`).join('\n')
}
