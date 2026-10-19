import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, ClipboardList, Database, Search, Sparkles, Users } from 'lucide-react'
import { api, type AssessmentListItem, type PatientCard, type SystemInfo } from '../lib/api'
import { formatDate, initials, relativeTime, titleCase } from '../lib/format'
import { WAITING_ON, stagePosition } from '../lib/stages'
import { usePolling } from '../lib/usePolling'
import { EhrBadge } from '../components/patient'
import { Avatar, Badge, Card, CardHeader, Empty, ErrorNote, Spinner } from '../components/ui'

// The physician's workspace: pick the EHR, find a patient; and the board of every assessment, grouped
// by who it is waiting on.

const BOARD_TABS: { key: string; label: string; match: (a: AssessmentListItem) => boolean }[] = [
  { key: 'active', label: 'Active', match: (a) => a.stage !== 'COMPLETED' && a.stage !== 'FAILED' },
  { key: 'me', label: 'Waiting on me', match: (a) => a.waitingOn === 'physician' },
  { key: 'patient', label: 'Waiting on patient', match: (a) => a.waitingOn === 'patient' },
  { key: 'lab', label: 'Waiting on lab', match: (a) => a.waitingOn === 'lab' },
  { key: 'completed', label: 'Completed', match: (a) => a.stage === 'COMPLETED' },
  { key: 'all', label: 'All', match: () => true },
]

export function PhysicianHome() {
  const [params, setParams] = useSearchParams()
  const [system, setSystem] = useState<SystemInfo>()
  const ehr = params.get('ehr') ?? 'cerner'
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState<PatientCard[]>()
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string>()
  const [tab, setTab] = useState('active')
  const { data: assessments, error } = usePolling(() => api.assessments(), 4000)

  useEffect(() => {
    api.system().then(setSystem).catch(() => undefined)
  }, [])

  async function search(q: string) {
    setSearching(true)
    setSearchError(undefined)
    try {
      setPatients(await api.searchPatients(ehr, q))
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e))
      setPatients([])
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    setQuery('')
    void search('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehr])

  const ehrInfo = system?.ehrs.find((e) => e.id === ehr)
  const counts = useMemo(() => Object.fromEntries(BOARD_TABS.map((t) => [t.key, (assessments ?? []).filter(t.match).length])), [assessments])
  // Open on "Active", but fall back to "All" when nothing is active.
  useEffect(() => {
    if (assessments && tab === 'active' && counts.active === 0 && counts.all > 0) setTab('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessments])
  const rows = (assessments ?? []).filter(BOARD_TABS.find((t) => t.key === tab)!.match)

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHeader title="Find a patient" subtitle="Search the EHR the patient's record lives in" icon={<Users size={16} />} />
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-sunken p-1" role="tablist" aria-label="EHR">
            {(system?.ehrs ?? [{ id: 'cerner', name: 'Oracle Health (Cerner)', reachable: true }, { id: 'athena', name: 'athenahealth', reachable: true }]).map((e) => (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={ehr === e.id}
                onClick={() => setParams({ ehr: e.id })}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition ${ehr === e.id ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${e.reachable ? 'bg-good' : 'bg-act'}`} aria-hidden />
                {e.name}
              </button>
            ))}
          </div>
          {ehrInfo && (
            <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              <Database size={12} /> FHIR R4 · {ehrInfo.reachable ? 'connected' : 'unreachable'} · {ehrInfo.summaryOperation ? 'supports $summary' : 'no $summary — composed searches'}
            </p>
          )}
          <form className="relative" onSubmit={(e) => { e.preventDefault(); void search(query) }}>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input className="field pl-9" placeholder="Name or MRN" value={query} onChange={(e) => setQuery(e.target.value)} />
          </form>
          {searchError && <ErrorNote message={searchError} />}
        </div>
        <ul className="max-h-[560px] divide-y divide-line overflow-y-auto border-t border-line">
          {searching && <li className="flex justify-center py-8 text-ink-muted"><Spinner /></li>}
          {!searching && patients?.length === 0 && <li><Empty title="No patients found" detail="Try another name or the MRN." /></li>}
          {!searching && patients?.map((p) => (
            <li key={p.id}>
              <Link to={`/physician/ehrs/${p.ehr}/patients/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken/60">
                <Avatar text={initials(p.name)} className="h-9 w-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                  <p className="text-xs text-ink-muted">{p.age ?? '—'} y · {titleCase(p.gender)} · {p.mrn} · {formatDate(p.birthDate)}</p>
                </div>
                <ChevronRight size={16} className="text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="min-w-0 space-y-5 self-start">
      <Card>
        <CardHeader title="Assessments" subtitle="Every longevity assessment, by who it is waiting on" icon={<ClipboardList size={16} />} />
        <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2.5">
          {BOARD_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${tab === t.key ? 'bg-ink text-surface' : 'text-ink-soft hover:bg-sunken hover:text-ink'}`}
            >
              {t.label} <span className="tabular-nums opacity-70">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
        {error && !assessments && <div className="p-5"><ErrorNote message={error} /></div>}
        {assessments && rows.length === 0 && <Empty title="Nothing here" detail="Open a patient on the left and start an assessment." />}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-5 py-2 font-medium">Patient</th>
                  <th className="px-3 py-2 font-medium">EHR</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">Detail</th>
                  <th className="px-3 py-2 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const waiting = WAITING_ON[a.waitingOn]
                  return (
                    <tr key={a.id} className="border-b border-line last:border-0 hover:bg-sunken/60">
                      <td className="px-5 py-3">
                        <Link to={`/physician/assessments/${a.id}`} className="flex items-center gap-3">
                          <Avatar text={initials(a.patientName)} className="h-8 w-8 text-xs" />
                          <span>
                            <span className="block font-medium text-ink">{a.patientName}</span>
                            <span className="block font-mono text-[11px] text-ink-muted">{a.id}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3"><EhrBadge name={a.ehrName} /></td>
                      <td className="px-3 py-3">
                        {a.stage === 'FAILED' ? <Badge tone="act">Stopped</Badge> : <Badge tone={waiting.tone}>{a.waitingOn === 'none' ? 'Released' : waiting.label}</Badge>}
                        <p className="mt-1 text-[11px] text-ink-muted">{stagePosition(a.stage).label}</p>
                      </td>
                      <td className="hidden max-w-sm px-3 py-3 text-xs text-ink-soft lg:table-cell">
                        {a.headline ? <span className="line-clamp-2">{a.headline}</span> : a.tests.length ? `${a.tests.length} tests: ${a.tests.join(', ')}` : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-ink-muted">{relativeTime(a.updatedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <LatestFindings assessments={assessments} />
      </div>
    </div>
  )
}

/** The headline of each released assessment: what the agents found, as the physician released it. */
function LatestFindings({ assessments }: { assessments?: AssessmentListItem[] }) {
  const done = (assessments ?? []).filter((a) => a.stage === 'COMPLETED' && a.headline).slice(0, 4)
  if (done.length === 0) return null
  return (
    <Card>
      <CardHeader title="Latest findings" subtitle="Headlines of released assessments — AI analysis, physician reviewed" icon={<Sparkles size={16} />} />
      <ul className="divide-y divide-line">
        {done.map((a) => (
          <li key={a.id}>
            <Link to={`/physician/assessments/${a.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-sunken/60">
              <Avatar text={initials(a.patientName)} className="h-8 w-8 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{a.patientName} <span className="ml-1 text-xs font-normal text-ink-muted">{relativeTime(a.updatedAt)}</span></p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-soft">{a.headline}</p>
              </div>
              <ChevronRight size={16} className="mt-1 shrink-0 text-ink-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
