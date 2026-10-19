import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, FlaskConical, Send, Syringe, UserRound } from 'lucide-react'
import { api, type LabOrder } from '../lib/api'
import { usePolling } from '../lib/usePolling'
import { formatTime, parseTimestamp } from '../lib/format'
import { Badge, Card, CardHeader, Empty, ErrorNote, Spinner } from '../components/ui'

// Presenter tool: the reference lab's back office (simulated). Orders placed by the integration appear
// here. "Collect specimen" is the patient arriving for the blood draw — it completes the workflow's
// "lab visit" human task; "Release results" files the results and resumes the workflow.

export function LabConsole() {
  const { data: orders, error, refresh } = usePolling(api.labOrders, 3000)
  const [busy, setBusy] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [actionError, setActionError] = useState<string>()

  async function act(order: LabOrder) {
    setBusy(order.id)
    setMessage(undefined)
    setActionError(undefined)
    try {
      if (order.status === 'awaiting-patient') {
        const r = await api.collectSpecimen(order.id)
        setMessage(`${order.patientName}: specimen collected (Specimen/${r.specimenId.slice(0, 8)}). ` +
          (r.integrationNotified ? 'Integration notified — the patient\'s lab-visit task is complete.' : 'Webhook failed — the integration\'s fallback poller will pick it up.'))
      } else {
        const r = await api.releaseLabOrder(order.id)
        setMessage(`${order.patientName}: ${r.observations} results released as DiagnosticReport/${r.diagnosticReportId.slice(0, 8)}. ` +
          (r.integrationNotified ? 'Integration notified by webhook.' : 'Webhook failed — the integration\'s fallback poller will pick it up.'))
      }
      void refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Lab console</h1>
          <Badge tone="watch">Simulated · presenter only</Badge>
        </div>
        <p className="text-sm text-ink-muted">Quest Diagnostics' side of the exchange. Orders arrive on the lab's FHIR server; the patient checks in, the sample is processed, results go back.</p>
      </div>
      {message && (
        <div className="flex items-start gap-2 rounded-lg border border-good/30 bg-good-soft px-3 py-2 text-sm text-good-ink">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {message}
        </div>
      )}
      {(error || actionError) && <ErrorNote message={actionError ?? error ?? ''} />}
      <Card>
        <CardHeader title="Orders" subtitle="ServiceRequests on the lab FHIR server" icon={<FlaskConical size={16} />} />
        {!orders ? (
          <div className="flex justify-center py-10 text-ink-muted"><Spinner /></div>
        ) : orders.length === 0 ? (
          <Empty title="No orders yet" detail="Order labs in the physician workspace to send one." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-5 py-2 font-medium">Patient</th>
                  <th className="px-3 py-2 font-medium">Tests</th>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {[...orders].sort((a, b) => Number(a.status === 'resulted') - Number(b.status === 'resulted')).map((o) => (
                  <tr key={o.id} className="border-b border-line align-top last:border-0">
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{o.patientName}</p>
                      <p className="text-xs text-ink-muted">{o.mrn} · {o.requester}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex max-w-md flex-wrap gap-1">{o.tests.map((t) => <Badge key={t.code}>{t.name}</Badge>)}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <p className="font-mono text-xs text-ink-soft">{o.placerOrderId}</p>
                      <p className="text-xs text-ink-muted">{o.authoredOn ? `received ${formatTime(o.authoredOn)}` : ''}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3"><OrderStatus order={o} /></td>
                    <td className="px-5 py-3 text-right">
                      {o.status === 'resulted' ? (
                        <span className="text-xs text-ink-muted">{o.reportId ? `DiagnosticReport/${o.reportId.slice(0, 8)}` : 'Done'}</span>
                      ) : o.status === 'awaiting-patient' ? (
                        <button className="btn-secondary py-1.5 text-xs" disabled={!!busy} onClick={() => act(o)}>
                          {busy === o.id ? <Spinner size={13} /> : <Syringe size={13} />} Patient arrived · collect specimen
                        </button>
                      ) : (
                        <button className="btn-primary py-1.5 text-xs" disabled={!!busy} onClick={() => act(o)}>
                          {busy === o.id ? <Spinner size={13} /> : <Send size={13} />} Release results
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function OrderStatus({ order }: { order: LabOrder }) {
  if (order.status === 'awaiting-patient') return <Badge tone="watch"><UserRound size={12} /> Awaiting patient</Badge>
  if (order.status === 'collected') return <Processing since={order.collectedAt} />
  return <Badge tone="good"><CheckCircle2 size={12} /> Resulted</Badge>
}

/** Collected and in processing, with the time since collection. */
function Processing({ since }: { since?: string | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const seconds = since ? Math.max(0, Math.round((now - parseTimestamp(since).getTime()) / 1000)) : 0
  const elapsed = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return <Badge tone="brand"><Clock size={12} /> Processing · {elapsed}</Badge>
}
