import { useEffect, useState, type ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Activity, CalendarDays, ChevronDown, ClipboardList, Database, FileJson, HeartPulse, Pill, Stethoscope, Syringe, Users, X,
} from 'lucide-react'
import { api, type BiomarkerSeries, type PatientSummary, type SummaryFlag, type VitalTrend } from '../lib/api'
import { formatDate, formatNumber, formatRange, formatShortDate, titleCase } from '../lib/format'
import { BiomarkerChart } from './BiomarkerChart'
import { Badge, Card, CardHeader, ErrorNote, SeverityChip, Spinner, TrendIcon } from './ui'

// The International Patient Summary, built deterministically from the EHR: no AI badge, every flag
// names the rule that produced it, and the FHIR queries behind it are one click away.

export function IpsSummary({ summary }: { summary: PatientSummary }) {
  const current = summary.medications.filter((m) => m.status === 'active')
  const past = summary.medications.filter((m) => m.status !== 'active')
  const activeProblems = summary.conditions.filter((c) => c.status === 'active')
  const pastProblems = summary.conditions.filter((c) => c.status !== 'active')

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Problem list" subtitle={`${activeProblems.length} active · ${pastProblems.length} past`} icon={<ClipboardList size={16} />} />
          <ul className="divide-y divide-line">
            {activeProblems.map((c) => (
              <li key={c.display + c.onset} className="flex items-start justify-between gap-3 px-5 py-2.5">
                <span className="text-sm font-medium text-ink">{c.display}</span>
                <span className="shrink-0 text-xs text-ink-muted">since {formatDate(c.onset)}</span>
              </li>
            ))}
            {activeProblems.length === 0 && <li className="px-5 py-3 text-sm text-ink-muted">No active problems.</li>}
          </ul>
          {pastProblems.length > 0 && (
            <Collapsible label={`${pastProblems.length} resolved or inactive`}>
              <ul className="space-y-1.5">
                {pastProblems.map((c) => (
                  <li key={c.display + c.onset} className="flex justify-between gap-3 text-xs">
                    <span className="text-ink-soft">{c.display}</span>
                    <span className="shrink-0 text-ink-muted">{formatDate(c.onset)}</span>
                  </li>
                ))}
              </ul>
            </Collapsible>
          )}
        </Card>

        <Card>
          <CardHeader title="Medications" subtitle={`${current.length} current · ${past.length} past`} icon={<Pill size={16} />} />
          <ul className="divide-y divide-line">
            {current.map((m) => (
              <li key={m.display + m.since} className="px-5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{m.display}</span>
                  {m.source === 'patient-reported' && <Badge tone="watch">Patient reported</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">{m.dosage ?? '—'} · since {formatDate(m.since)}</p>
              </li>
            ))}
            {current.length === 0 && <li className="px-5 py-3 text-sm text-ink-muted">No current medications.</li>}
          </ul>
          {past.length > 0 && (
            <Collapsible label={`Medication history (${past.length})`}>
              <ul className="space-y-1.5">
                {past.map((m) => (
                  <li key={m.display + m.since} className="text-xs">
                    <span className="text-ink-soft">{m.display}</span>
                    <span className="text-ink-muted"> · {formatDate(m.since)}{m.until ? ` → ${formatDate(m.until)}` : ''} · {m.status}</span>
                  </li>
                ))}
              </ul>
            </Collapsible>
          )}
        </Card>

        <Card>
          <CardHeader title="Vital signs" subtitle={summary.vitals.bloodPressureDate ? `Latest ${formatDate(summary.vitals.bloodPressureDate)}` : undefined} icon={<Activity size={16} />} />
          <dl className="grid grid-cols-3 gap-x-3 gap-y-3 px-5 py-4">
            <Vital label="Blood pressure" value={summary.vitals.systolic ? `${formatNumber(summary.vitals.systolic)}/${formatNumber(summary.vitals.diastolic)}` : '—'} unit="mmHg" />
            <Vital label="Heart rate" value={formatNumber(summary.vitals.heartRate)} unit="/min" />
            <Vital label="Resp. rate" value={formatNumber(summary.vitals.respiratoryRate)} unit="/min" />
            <Vital label="BMI" value={formatNumber(summary.vitals.bmi)} unit="kg/m²" />
            <Vital label="Weight" value={formatNumber(summary.vitals.weightKg)} unit="kg" />
            <Vital label="Height" value={formatNumber(summary.vitals.heightCm)} unit="cm" />
          </dl>
          <div className="space-y-3 border-t border-line px-5 py-3">
            {summary.vitalTrends.filter((t) => t.points.length > 1 && (t.code === '85354-9' || t.code === '29463-7')).map((t) => (
              <VitalTrendChart key={t.code} trend={t} />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Risk flags" subtitle="Deterministic rules over the EHR record — allergies vs. medications, trends, ranges, family history, vitals" icon={<HeartPulse size={16} />} />
          <RiskFlags flags={summary.flags} />
        </Card>
        <Card>
          <CardHeader title="Care gaps" subtitle="Recommended baseline tests never measured" />
          <ul className="space-y-2 px-5 py-4">
            {summary.careGaps.map((gap) => (
              <li key={gap.title} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink">{gap.title.replace('No ', '').replace(' on record', '')}</span>
                <Badge>{gap.suggestedTests.join(', ')}</Badge>
              </li>
            ))}
            {summary.careGaps.length === 0 && <li className="text-sm text-ink-muted">Baseline complete.</li>}
          </ul>
        </Card>
      </div>

      {summary.biomarkers.length > 0 && (
        <div>
          <h3 className="eyebrow mb-3">Results · biomarker trends, last 3 years</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {summary.biomarkers.map((series) => <BiomarkerCard key={series.code} series={series} />)}
          </div>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Immunizations" subtitle={`${summary.immunizations.length} recorded`} icon={<Syringe size={16} />} />
          <ul className="max-h-64 divide-y divide-line overflow-y-auto">
            {summary.immunizations.map((i, n) => (
              <li key={i.vaccine + i.date + n} className="flex justify-between gap-3 px-5 py-2 text-xs">
                <span className="text-ink">{i.vaccine}</span>
                <span className="shrink-0 text-ink-muted">{formatDate(i.date)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Procedures" subtitle="Latest of each, last 3 years" icon={<Stethoscope size={16} />} />
          <ul className="max-h-64 divide-y divide-line overflow-y-auto">
            {summary.procedures.map((p) => (
              <li key={p.display} className="flex justify-between gap-3 px-5 py-2 text-xs">
                <span className="text-ink">{p.display}</span>
                <span className="shrink-0 text-ink-muted">{formatDate(p.date)}</span>
              </li>
            ))}
            {summary.procedures.length === 0 && <li className="px-5 py-3 text-sm text-ink-muted">None recorded.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Social & family history" icon={<Users size={16} />} />
          <div className="space-y-3 px-5 py-4 text-sm">
            {summary.socialHistory.map((s) => (
              <p key={s.label}><span className="text-ink-muted">{s.label}:</span> <span className="text-ink">{s.value}</span></p>
            ))}
            <div className="space-y-1 border-t border-line pt-3">
              {summary.familyHistory.length === 0 && <p className="text-ink-muted">No family history recorded.</p>}
              {summary.familyHistory.map((f) => (
                <p key={f.relationship + f.condition} className="text-ink">
                  <span className="capitalize">{f.relationship}</span>: {f.condition}
                  {f.onsetAge != null && <span className="text-ink-muted"> at {f.onsetAge}</span>}
                </p>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent visits" icon={<CalendarDays size={16} />} />
        <ul className="divide-y divide-line">
          {summary.encounters.map((e) => (
            <li key={e.id} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-5 py-2.5 text-sm sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)]">
              <span className="text-ink-muted">{formatDate(e.date)}</span>
              <span className="text-ink">{e.type}{e.reason ? <span className="text-ink-muted"> — {e.reason}</span> : null}</span>
              <span className="hidden truncate text-xs text-ink-muted sm:block">{e.provider ?? ''}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Provenance summary={summary} />
    </div>
  )
}

// Out-of-range results grouped by body system (LOINC codes of the analytes the demo's labs report).
const AREA_OF: Record<string, string> = {
  '33863-2': 'Kidney', '62238-1': 'Kidney',
  '2093-3': 'Lipids', '13457-7': 'Lipids', '2085-9': 'Lipids', '2571-8': 'Lipids', '1884-6': 'Lipids', '43583-4': 'Lipids',
  '1558-6': 'Metabolic', '20448-7': 'Metabolic', '4548-4': 'Metabolic', '3084-1': 'Metabolic',
  '1742-6': 'Liver', '2324-2': 'Liver',
  '30522-7': 'Inflammation & vascular', '13965-9': 'Inflammation & vascular',
}
const AREAS = ['Kidney', 'Metabolic', 'Lipids', 'Liver', 'Inflammation & vascular', 'Other']
const SEVERITY_RANK = { concern: 0, watch: 1, info: 2 }
const isRangeFlag = (f: SummaryFlag) => f.detail.startsWith('Outside the reference range')

/**
 * Clinical rules first (an allergy against a medication must never sit at row 12), then the
 * out-of-range results, compact and grouped by body system.
 */
function RiskFlags({ flags }: { flags: SummaryFlag[] }) {
  const rules = flags.filter((f) => !isRangeFlag(f)).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  const ranges = flags.filter(isRangeFlag)
  const date = ranges[0]?.detail.match(/on (\d{4}-\d{2}-\d{2})/)?.[1]
  const groups = AREAS.map((area) => ({ area, items: ranges.filter((f) => (AREA_OF[f.codes[0]] ?? 'Other') === area) })).filter((g) => g.items.length)
  if (flags.length === 0) return <p className="px-5 py-4 text-sm text-ink-muted">No flags raised.</p>
  return (
    <div>
      <ul className="divide-y divide-line">
        {rules.map((flag) => (
          <li key={flag.title} className="flex items-start gap-3 px-5 py-2.5">
            <div className="w-20 shrink-0 pt-0.5"><SeverityChip severity={flag.severity} /></div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{flag.title}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{flag.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {ranges.length > 0 && (
        <div className="border-t border-line px-5 py-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
            <SeverityChip severity="concern" label={`${ranges.length}`} /> results outside the reference range{date ? ` on ${formatDate(date)}` : ''}
          </p>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {groups.map(({ area, items }) => (
              <div key={area}>
                <p className="eyebrow mb-1">{area} · {items.length}</p>
                <ul className="space-y-0.5">
                  {items.map((f) => {
                    const m = f.title.match(/^(.+?) (high|low) \((.+)\)$/)
                    return (
                      <li key={f.title} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate text-ink">{m ? m[1] : f.title}</span>
                        {m && <span className="shrink-0 tabular-nums font-medium text-act-ink">{m[3]} {m[2] === 'high' ? 'H' : 'L'}</span>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Vital({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-ink">{value} <span className="text-xs font-normal text-ink-muted">{unit}</span></dd>
    </div>
  )
}

function Collapsible({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-line">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-2 text-xs font-medium text-ink-soft hover:text-ink">
        {label}
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-3">{children}</div>}
    </div>
  )
}

/** Blood pressure (two lines, directly labelled) or weight over time. */
function VitalTrendChart({ trend }: { trend: VitalTrend }) {
  const isBp = trend.code === '85354-9'
  const data = trend.points.map((p) => ({ ...p, label: formatShortDate(p.date) }))
  const last = data[data.length - 1]
  return (
    <div>
      <p className="text-xs font-medium text-ink-soft">{trend.name} <span className="font-normal text-ink-muted">{trend.unit}</span></p>
      <div className="h-24" role="img" aria-label={`${trend.name} trend, ${trend.points.length} readings`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'rgb(var(--line))' }} tick={{ fill: 'rgb(var(--ink-muted))', fontSize: 10 }} />
            <YAxis domain={['dataMin - 8', 'dataMax + 8']} tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--ink-muted))', fontSize: 10 }} width={36} allowDecimals={false} tickFormatter={(v: number) => String(Math.round(v))} />
            <Tooltip
              cursor={{ stroke: 'rgb(var(--ink-muted))', strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as { date: string; value: number; value2?: number }
                return (
                  <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop">
                    <p className="font-medium text-ink">{formatDate(p.date)}</p>
                    <p className="text-ink">{formatNumber(p.value)}{isBp && p.value2 != null ? `/${formatNumber(p.value2)}` : ''} {trend.unit}</p>
                  </div>
                )
              }}
            />
            <Line dataKey="value" stroke="rgb(var(--series))" strokeWidth={2} isAnimationActive={false} dot={{ r: 3, fill: 'rgb(var(--surface))', strokeWidth: 2 }} />
            {isBp && <Line dataKey="value2" stroke="rgb(var(--series))" strokeOpacity={0.55} strokeDasharray="4 3" strokeWidth={2} isAnimationActive={false} dot={{ r: 3, fill: 'rgb(var(--surface))', strokeWidth: 2 }} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {isBp && last && <p className="text-[11px] text-ink-muted">Solid: systolic · dashed: diastolic</p>}
    </div>
  )
}

export function BiomarkerCard({ series }: { series: BiomarkerSeries }) {
  const outOfRange = series.status !== 'normal'
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">{series.name}</p>
          <p className="text-xs text-ink-muted">Ref {formatRange(series.referenceLow, series.referenceHigh, series.unit)}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-ink">
            {formatNumber(series.latest)} <span className="text-xs font-normal text-ink-muted">{series.unit}</span>
          </p>
          <p className={`inline-flex items-center gap-0.5 text-xs ${outOfRange ? 'text-act-ink' : 'text-ink-muted'}`}>
            <TrendIcon trend={series.trend} />
            {series.changePct != null ? `${series.changePct > 0 ? '+' : ''}${formatNumber(series.changePct)}%` : 'single result'}
            {outOfRange && ` · ${series.status}`}
          </p>
        </div>
      </div>
      <div className="mt-2">
        <BiomarkerChart points={series.points} unit={series.unit} referenceLow={series.referenceLow} referenceHigh={series.referenceHigh} height={120} />
      </div>
      {series.longevityTarget && <p className="mt-1 text-[11px] text-ink-muted">Target {series.longevityTarget}</p>}
    </div>
  )
}

function Provenance({ summary }: { summary: PatientSummary }) {
  const [open, setOpen] = useState(false)
  const [bundleOpen, setBundleOpen] = useState(false)
  return (
    <>
      <div className="rounded-xl border border-line bg-sunken/50">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 text-left text-sm text-ink-soft hover:text-ink">
            <Database size={15} />
            {summary.source === 'summary-operation'
              ? `Built from ${summary.patient.ehrName} Patient/$summary`
              : `Built from ${summary.fhirQueries.length} FHIR queries to ${summary.patient.ehrName}, run in parallel (the EHR has no $summary)`}
            <ChevronDown size={16} className={`text-ink-muted transition ${open ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" className="btn-secondary py-1.5 text-xs" onClick={() => setBundleOpen(true)}>
            <FileJson size={14} /> View IPS bundle
          </button>
        </div>
        {open && (
          <ul className="space-y-1 border-t border-line px-4 py-3 font-mono text-xs text-ink-soft">
            {summary.fhirQueries.map((q) => <li key={q}>{q}</li>)}
          </ul>
        )}
      </div>
      {bundleOpen && <IpsBundleDialog ehr={summary.patient.ehr} patientId={summary.patient.id} name={summary.patient.name} onClose={() => setBundleOpen(false)} />}
    </>
  )
}

function IpsBundleDialog({ ehr, patientId, name, onClose }: { ehr: string; patientId: string; name: string; onClose: () => void }) {
  const [bundle, setBundle] = useState<unknown>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    api.ips(ehr, patientId).then(setBundle).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [ehr, patientId])
  const entries = (bundle as { entry?: { resource: { resourceType: string; section?: { title: string; entry?: unknown[] }[] } }[] } | undefined)?.entry
  const composition = entries?.[0]?.resource
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="International Patient Summary bundle">
      <div className="card flex max-h-[85vh] w-full max-w-4xl flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">International Patient Summary — {name}</h2>
            <p className="text-xs text-ink-muted">FHIR R4 document Bundle (Composition + sections), composed by the integration</p>
          </div>
          <button type="button" className="btn-ghost px-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {error && <div className="p-5"><ErrorNote message={error} /></div>}
        {!bundle && !error && <div className="flex justify-center py-16 text-ink-muted"><Spinner size={20} /></div>}
        {composition?.section && (
          <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3">
            {composition.section.map((s) => (
              <Badge key={s.title}>{titleCase(s.title)} · {s.entry?.length ?? 0}</Badge>
            ))}
          </div>
        )}
        {bundle != null && (
          <pre className="flex-1 overflow-auto bg-sunken/50 px-5 py-4 font-mono text-[11px] leading-relaxed text-ink-soft">
            {JSON.stringify(bundle, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
