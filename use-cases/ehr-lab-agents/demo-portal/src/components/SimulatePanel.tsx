import { useState } from 'react'
import { Power, Unplug, Zap } from 'lucide-react'
import { api } from '../lib/api'
import { usePolling } from '../lib/usePolling'
import { Card, CardHeader, ErrorNote, Spinner } from './ui'

// Presenter controls: real failures, not flags. EHR and webhook outages disable a Toxiproxy proxy so
// calls fail on the network; the crash switch exits the integration process and Docker restarts it.

export function SimulatePanel() {
  const { data: switches, error, refresh } = usePolling(() => api.faults(), 3000)
  const [busy, setBusy] = useState<string>()
  const [crashNote, setCrashNote] = useState<string>()
  const [actionError, setActionError] = useState<string>()

  async function toggle(id: string, active: boolean) {
    setBusy(id)
    setActionError(undefined)
    try {
      await api.setFault(id, active)
      await refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(undefined)
    }
  }

  async function crash() {
    if (!window.confirm('Crash the integration process now? Docker restarts it in a few seconds; workflows carry on from Temporal.')) return
    setBusy('crash')
    try {
      await api.crash()
      setCrashNote('Integration exited — Docker is restarting it. The workflow keeps its state in Temporal.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Card>
      <CardHeader title="Simulate failures" subtitle="Presenter controls — real network cuts via Toxiproxy" icon={<Zap size={16} />} />
      <ul className="divide-y divide-line">
        {(switches ?? []).map((s) => (
          <li key={s.id} className="flex items-start gap-3 px-4 py-3">
            <Unplug size={16} className={`mt-0.5 shrink-0 ${s.active ? 'text-act-ink' : 'text-ink-muted'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{s.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-ink-muted">{s.description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={s.active}
              aria-label={s.label}
              disabled={!s.available || busy === s.id}
              onClick={() => toggle(s.id, !s.active)}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${s.active ? 'bg-act' : 'bg-line'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${s.active ? 'left-[22px]' : 'left-0.5'}`} />
              <span className="sr-only">{s.active ? 'On' : 'Off'}</span>
            </button>
          </li>
        ))}
        {!switches && !error && <li className="flex justify-center py-6 text-ink-muted"><Spinner /></li>}
        <li className="flex items-start gap-3 px-4 py-3">
          <Power size={16} className="mt-0.5 shrink-0 text-ink-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Crash the integration</p>
            <p className="mt-0.5 text-xs leading-snug text-ink-muted">Kills the process mid-flight. Best while the workflow waits on the patient or the lab.</p>
          </div>
          <button type="button" className="btn-secondary shrink-0 px-2.5 py-1 text-xs" disabled={busy === 'crash'} onClick={crash}>
            {busy === 'crash' ? <Spinner size={12} /> : <Power size={12} />} Crash
          </button>
        </li>
      </ul>
      {(error || actionError || crashNote) && (
        <div className="space-y-2 border-t border-line px-4 py-3">
          {crashNote && <p className="text-xs text-ink-soft">{crashNote}</p>}
          {(error || actionError) && <ErrorNote message={actionError ?? `Integration unreachable (${error}) — reconnecting…`} />}
        </div>
      )}
    </Card>
  )
}
