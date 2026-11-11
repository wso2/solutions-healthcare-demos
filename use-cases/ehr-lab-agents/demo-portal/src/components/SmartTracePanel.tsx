import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ChevronRight, PanelRightClose, PanelRightOpen, Trash2 } from 'lucide-react'
import { clearTrace, subscribeTrace, traceSnapshot, type TraceEntry, type TraceKind, type TraceMessage } from '../lib/smartTrace'
import { Badge } from './ui'

// Right-hand panel on the patient app's landing page: every request/response of the SMART on FHIR sign-in and of
// the API calls through the APIM gateway, oldest first, each one collapsible.

const KIND: Record<TraceKind, { label: string; tone: 'neutral' | 'brand' | 'good' | 'watch' | 'act' | 'ai' }> = {
  discovery: { label: 'Discovery', tone: 'neutral' },
  authorize: { label: 'Authorize', tone: 'ai' },
  token: { label: 'Token', tone: 'brand' },
  refresh: { label: 'Refresh', tone: 'brand' },
  api: { label: 'API', tone: 'good' },
  revoke: { label: 'Revoke', tone: 'watch' },
  logout: { label: 'Logout', tone: 'watch' },
}

const OPEN_KEY = 'patient-app.trace-panel-open'

export function useTracePanelOpen() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== 'false'
    } catch {
      return true
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, String(open))
    } catch {
      /* storage unavailable */
    }
  }, [open])
  return [open, setOpen] as const
}

export function SmartTracePanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const entries = useSyncExternalStore(subscribeTrace, traceSnapshot)

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed right-0 top-24 z-20 flex items-center gap-2 rounded-l-lg border border-r-0 border-line bg-surface px-2 py-3 text-xs font-medium text-ink-muted shadow-card hover:text-ink [writing-mode:vertical-rl]"
        aria-label="Show SMART on FHIR traffic"
      >
        <PanelRightOpen size={15} className="rotate-90" /> SMART traffic · {entries.length}
      </button>
    )
  }

  return (
    <aside className="fixed bottom-0 right-0 top-14 z-20 flex w-full max-w-[460px] flex-col border-l border-line bg-surface shadow-pop" aria-label="SMART on FHIR traffic">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">SMART on FHIR traffic</p>
          <p className="text-[11px] text-ink-muted">Sign-in and API calls through WSO2 API Manager, oldest first</p>
        </div>
        <button type="button" className="btn-ghost px-2" onClick={clearTrace} title="Clear" aria-label="Clear the list" disabled={!entries.length}>
          <Trash2 size={15} />
        </button>
        <button type="button" className="btn-ghost px-2" onClick={onToggle} title="Hide" aria-label="Hide the panel">
          <PanelRightClose size={16} />
        </button>
      </div>
      <ol className="flex-1 space-y-2 overflow-y-auto p-3">
        {entries.length === 0 && <li className="px-2 py-8 text-center text-xs text-ink-muted">Nothing yet. Sign in to see the flow.</li>}
        {entries.map((e, i) => <TraceItem key={e.id} entry={e} index={i + 1} />)}
      </ol>
    </aside>
  )
}

function TraceItem({ entry: e, index }: { entry: TraceEntry; index: number }) {
  const kind = KIND[e.kind]
  const status = e.response?.status
  const statusTone = e.error ? 'act' : !status ? 'neutral' : status < 300 ? 'good' : status < 400 ? 'ai' : 'act'
  return (
    <li>
      <details className="group rounded-lg border border-line bg-canvas/40 open:bg-surface">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} className="shrink-0 text-ink-muted transition group-open:rotate-90" />
          <span className="w-5 shrink-0 text-right font-mono text-ink-muted">{index}</span>
          <Badge tone={kind.tone}>{kind.label}</Badge>
          <span className="min-w-0 flex-1 truncate font-medium text-ink" title={e.title}>{e.title}</span>
          <Badge tone={statusTone}>{e.error ? 'failed' : status ?? (e.endedAt ? '—' : '…')}</Badge>
        </summary>
        <div className="space-y-3 border-t border-line px-3 py-3 text-xs">
          <p className="text-ink-muted">
            {new Date(e.startedAt).toLocaleTimeString()}
            {e.endedAt && ` · ${Math.max(0, e.endedAt - e.startedAt)} ms`}
          </p>
          <Message title="Request" message={e.request} line={`${e.request.method ?? 'GET'} ${e.request.url ?? ''}`} />
          {e.response && (
            <Message title="Response" message={e.response} line={`${e.response.status ?? ''} ${e.response.statusText ?? ''}${e.response.url ? ` → ${e.response.url}` : ''}`} />
          )}
          {e.error && <Section title="Error"><p className="text-act-ink">{e.error}</p></Section>}
          {!e.response && !e.error && <p className="text-ink-muted">Waiting for the response…</p>}
        </div>
      </details>
    </li>
  )
}

function Message({ title, message: m, line }: { title: string; message: TraceMessage; line: string }) {
  const headers = Object.entries(m.headers ?? {})
  return (
    <Section title={title}>
      <p className="break-all font-mono text-ink">{line}</p>
      {m.note && <p className="mt-1 text-ink-muted">{m.note}</p>}
      {headers.length > 0 && (
        <Code label="Headers">{headers.map(([k, v]) => `${k}: ${v}`).join('\n')}</Code>
      )}
      {m.body && <Code label={title === 'Request' && m.method === 'GET' ? 'Query parameters' : 'Body'}>{m.body}</Code>}
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      {children}
    </div>
  )
}

function Code({ label, children }: { label: string; children: string }) {
  return (
    <div className="mt-1.5">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <pre className="mt-0.5 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-sunken px-2 py-1.5 font-mono text-[11px] leading-relaxed text-ink">{children}</pre>
    </div>
  )
}
