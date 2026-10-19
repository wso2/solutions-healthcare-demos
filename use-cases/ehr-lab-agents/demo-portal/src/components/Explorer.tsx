import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Activity, CalendarDays, CheckSquare, ChevronDown, ClipboardList, Database, FileText, FlaskConical, Pill, RefreshCw, Search,
  ShieldAlert, Sparkles, Square, Stethoscope, Syringe, Users, type LucideIcon,
} from 'lucide-react'
import { api, type ExplorerKind, type ExplorerResult, type ExplorerRow } from '../lib/api'
import { formatDate } from '../lib/format'
import { Badge, Card, Empty, ErrorNote, Spinner } from './ui'

// The EHR data explorer: pick data types and a date range, fetch them from the patient's EHR (one FHIR
// search per type, filtered by the EHR), narrow the table, and hand a selection to the AI evaluation.

const KIND_META: Record<string, { label: string; icon: LucideIcon }> = {
  encounter: { label: 'Encounter', icon: CalendarDays },
  problem: { label: 'Problem', icon: ClipboardList },
  medication: { label: 'Prescription', icon: Pill },
  'medication-reported': { label: 'Reported med', icon: Pill },
  lab: { label: 'Lab result', icon: FlaskConical },
  report: { label: 'Lab report', icon: FileText },
  vital: { label: 'Vital sign', icon: Activity },
  allergy: { label: 'Allergy', icon: ShieldAlert },
  immunization: { label: 'Immunization', icon: Syringe },
  procedure: { label: 'Procedure', icon: Stethoscope },
  note: { label: 'Clinical note', icon: FileText },
  social: { label: 'Social history', icon: Users },
}

const DEFAULT_KINDS = ['encounter', 'problem', 'medication', 'medication-reported', 'lab', 'vital', 'allergy', 'note']

const PRESETS: { key: string; label: string; years?: number; months?: number }[] = [
  { key: '6m', label: '6 months', months: 6 },
  { key: '1y', label: '1 year', years: 1 },
  { key: '3y', label: '3 years', years: 3 },
  { key: '5y', label: '5 years', years: 5 },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
]

function presetFrom(key: string): string {
  const preset = PRESETS.find((p) => p.key === key)
  if (!preset || (!preset.years && !preset.months)) return ''
  const d = new Date()
  if (preset.years) d.setFullYear(d.getFullYear() - preset.years)
  if (preset.months) d.setMonth(d.getMonth() - preset.months)
  return d.toISOString().slice(0, 10)
}

export interface EvaluateArgs {
  rows: ExplorerRow[]
  question: string
  dateFrom?: string
  dateTo?: string
}

interface Props {
  ehr: string
  ehrName: string
  patientId: string
  /** When given, rows are selectable and the selection can be sent for an AI evaluation. */
  onEvaluate?: (args: EvaluateArgs) => Promise<void>
  evaluating?: boolean
}

export function Explorer({ ehr, ehrName, patientId, onEvaluate, evaluating }: Props) {
  const [kinds, setKinds] = useState<ExplorerKind[]>([])
  const [selectedKinds, setSelectedKinds] = useState<string[]>(DEFAULT_KINDS)
  const [preset, setPreset] = useState('3y')
  const [from, setFrom] = useState(presetFrom('3y'))
  const [to, setTo] = useState('')
  const [result, setResult] = useState<ExplorerResult>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [text, setText] = useState('')
  const [abnormalOnly, setAbnormalOnly] = useState(false)
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string>()
  const [question, setQuestion] = useState('')
  const [showQueries, setShowQueries] = useState(false)

  useEffect(() => {
    api.explorerKinds().then(setKinds).catch(() => undefined)
  }, [])

  async function fetchRecords() {
    setLoading(true)
    setError(undefined)
    try {
      const r = await api.records(ehr, patientId, selectedKinds, from || undefined, to || undefined)
      setResult(r)
      setSelected(new Set())
      setTab('all')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehr, patientId])

  const rows = useMemo(() => {
    const needle = text.trim().toLowerCase()
    return (result?.rows ?? []).filter((r) => {
      if (tab !== 'all' && r.kind !== tab) return false
      if (abnormalOnly && !(r.flag === 'H' || r.flag === 'L' || r.flag === 'high')) return false
      if (needle && !`${r.title} ${r.detail ?? ''} ${r.value ?? ''} ${r.text ?? ''}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [result, text, abnormalOnly, tab])

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.ref))
  const toggle = (ref: string) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(ref)) next.delete(ref)
    else next.add(ref)
    return next
  })
  const toggleAllVisible = () => setSelected((s) => {
    const next = new Set(s)
    if (allVisibleSelected) rows.forEach((r) => next.delete(r.ref))
    else rows.forEach((r) => next.add(r.ref))
    return next
  })
  const selectedRows = (result?.rows ?? []).filter((r) => selected.has(r.ref))

  return (
    <Card>
      <div className="space-y-4 border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">EHR data explorer</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Fetch the patient's records from {ehrName} over FHIR — choose what and how far back</p>
          </div>
          <button type="button" className="btn-primary" onClick={fetchRecords} disabled={loading || selectedKinds.length === 0}>
            {loading ? <Spinner size={15} /> : <RefreshCw size={15} />} Fetch from {ehrName}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Data types">
          {(kinds.length ? kinds : DEFAULT_KINDS.map((k) => ({ kind: k, label: KIND_META[k]?.label ?? k, resourceType: '' }))).map((k) => {
            const on = selectedKinds.includes(k.kind)
            const Icon = KIND_META[k.kind]?.icon ?? Database
            return (
              <button
                key={k.kind}
                type="button"
                aria-pressed={on}
                onClick={() => setSelectedKinds((s) => (on ? s.filter((x) => x !== k.kind) : [...s, k.kind]))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line bg-surface text-ink-soft hover:bg-sunken'}`}
                title={k.resourceType ? `FHIR ${k.resourceType}` : undefined}
              >
                <Icon size={12} /> {k.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-muted">Date range</span>
          <div className="flex flex-wrap rounded-lg border border-line bg-sunken p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => { setPreset(p.key); if (p.key !== 'custom') { setFrom(presetFrom(p.key)); setTo('') } }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${preset === p.key ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" className="field w-auto py-1 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
              <span className="text-xs text-ink-muted">to</span>
              <input type="date" className="field w-auto py-1 text-xs" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
            </div>
          )}
        </div>
      </div>

      {error && <div className="px-5 pt-4"><ErrorNote message={error} /></div>}

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
            <TabButton active={tab === 'all'} onClick={() => setTab('all')}>All · {result.rows.length}</TabButton>
            {Object.entries(result.counts).filter(([, n]) => n > 0).map(([kind, n]) => (
              <TabButton key={kind} active={tab === kind} onClick={() => setTab(kind)}>{KIND_META[kind]?.label ?? kind} · {n}</TabButton>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
                <input type="checkbox" checked={abnormalOnly} onChange={(e) => setAbnormalOnly(e.target.checked)} className="accent-[rgb(var(--brand))]" />
                Abnormal only
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input className="field w-48 py-1 pl-7 text-xs" placeholder="Search records" value={text} onChange={(e) => setText(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="max-h-[520px] overflow-auto">
            {rows.length === 0 ? (
              <Empty title="No records match" detail="Widen the date range, add data types, or clear the filters." />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-line text-left text-xs text-ink-muted">
                    {onEvaluate && (
                      <th className="w-10 px-3 py-2">
                        <button type="button" onClick={toggleAllVisible} aria-label="Select all visible" className="text-ink-muted hover:text-ink">
                          {allVisibleSelected ? <CheckSquare size={15} className="text-brand" /> : <Square size={15} />}
                        </button>
                      </th>
                    )}
                    <th className="w-28 px-3 py-2 font-medium">Date</th>
                    <th className="w-32 px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Record</th>
                    <th className="px-3 py-2 text-right font-medium">Value</th>
                    <th className="hidden px-3 py-2 font-medium xl:table-cell">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const meta = KIND_META[r.kind]
                    const Icon = meta?.icon ?? Database
                    const flagged = r.flag === 'H' || r.flag === 'L' || r.flag === 'high'
                    const isOpen = expanded === r.ref
                    return (
                      <Fragment key={r.ref}>
                        <tr
                          className={`cursor-pointer border-b border-line align-top last:border-0 hover:bg-sunken/60 ${selected.has(r.ref) ? 'bg-brand-soft/40' : ''}`}
                          onClick={() => (r.text ? setExpanded(isOpen ? undefined : r.ref) : onEvaluate && toggle(r.ref))}
                        >
                          {onEvaluate && (
                            <td className="px-3 py-2" onClick={(e) => { e.stopPropagation(); toggle(r.ref) }}>
                              {selected.has(r.ref) ? <CheckSquare size={15} className="text-brand" /> : <Square size={15} className="text-ink-muted" />}
                            </td>
                          )}
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-muted">{formatDate(r.date?.slice(0, 10))}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1 text-xs text-ink-soft"><Icon size={12} /> {meta?.label ?? r.kind}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-ink">{r.title}</span>
                            {r.status && r.status !== 'final' && r.status !== 'finished' && r.status !== 'completed' && (
                              <span className="ml-1.5 text-[11px] text-ink-muted">{r.status}</span>
                            )}
                            {r.text && <ChevronDown size={13} className={`ml-1 inline text-ink-muted transition ${isOpen ? 'rotate-180' : ''}`} />}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            {r.value && (
                              <>
                                <span className={`font-semibold ${flagged ? 'text-act-ink' : 'text-ink'}`}>{r.value}</span>
                                {r.unit && <span className="ml-1 text-xs text-ink-muted">{r.unit}</span>}
                                {flagged && <span className="ml-1 text-xs font-semibold text-act-ink">{r.flag === 'high' ? '!' : r.flag}</span>}
                              </>
                            )}
                            {!r.value && r.kind === 'allergy' && r.flag && <Badge tone={r.flag === 'high' ? 'act' : 'watch'}>{r.flag} criticality</Badge>}
                          </td>
                          <td className="hidden max-w-xs truncate px-3 py-2 text-xs text-ink-muted xl:table-cell" title={r.detail ?? undefined}>{r.detail}</td>
                        </tr>
                        {isOpen && r.text && (
                          <tr className="border-b border-line bg-sunken/40">
                            <td colSpan={onEvaluate ? 6 : 5} className="px-6 py-3">
                              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-soft">{r.text}</pre>
                              {onEvaluate && (
                                <button type="button" className="btn-ghost mt-2 px-2 py-1 text-xs" onClick={() => toggle(r.ref)}>
                                  {selected.has(r.ref) ? 'Remove from selection' : 'Add to selection'}
                                </button>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-line">
            <button type="button" onClick={() => setShowQueries(!showQueries)} className="flex w-full items-center justify-between px-5 py-2 text-left text-xs text-ink-muted hover:text-ink">
              <span className="flex items-center gap-1.5"><Database size={13} /> {result.queries.length} FHIR searches to {ehrName} in parallel · {result.durationMs} ms</span>
              <ChevronDown size={14} className={`transition ${showQueries ? 'rotate-180' : ''}`} />
            </button>
            {showQueries && (
              <ul className="space-y-1 px-5 pb-3 font-mono text-[11px] text-ink-soft">
                {result.queries.map((q) => <li key={q}>{q}</li>)}
              </ul>
            )}
          </div>

          {onEvaluate && (
            <div className="space-y-3 border-t border-line bg-ai-soft/40 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{selected.size}</span> record{selected.size === 1 ? '' : 's'} selected
                  {from && <span className="text-ink-muted"> · {formatDate(from)} – {to ? formatDate(to) : 'today'}</span>}
                </p>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={toggleAllVisible}>
                    {allVisibleSelected ? 'Clear visible' : `Select all ${rows.length} visible`}
                  </button>
                  {selected.size > 0 && <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setSelected(new Set())}>Clear</button>}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="field flex-1"
                  placeholder="Optional question — e.g. “What explains the falling eGFR, and what should we measure?”"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
                <button
                  type="button"
                  className="btn bg-ai text-white hover:opacity-90 dark:text-canvas"
                  disabled={selected.size === 0 || evaluating}
                  onClick={() => onEvaluate({ rows: selectedRows, question, dateFrom: from || undefined, dateTo: to || undefined })}
                >
                  {evaluating ? <Spinner size={15} /> : <Sparkles size={15} />} Evaluate with AI
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {!result && loading && <div className="flex justify-center py-16 text-ink-muted"><Spinner size={20} /></div>}
    </Card>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs font-medium ${active ? 'bg-ink text-surface' : 'text-ink-soft hover:bg-sunken hover:text-ink'}`}
    >
      {children}
    </button>
  )
}
