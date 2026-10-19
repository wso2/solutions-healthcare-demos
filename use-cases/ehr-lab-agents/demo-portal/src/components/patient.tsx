import type { ReactNode } from 'react'
import { Database, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { AllergyItem, PatientCard } from '../lib/api'
import { formatDate, initials, titleCase } from '../lib/format'
import { Avatar } from './ui'

// Pieces every patient-facing screen shares: which EHR the record lives in, and the patient header
// with the allergy banner a clinician must never have to scroll for.

/** Which EHR a record lives in. EHR identity colour, icon and the system's name — never colour alone. */
export function EhrBadge({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-ehr/30 bg-ehr/10 px-2 py-0.5 text-xs font-medium text-ink ${className}`}>
      <Database size={12} className="text-ehr" />
      {name}
    </span>
  )
}

export function PatientHeader({ patient, allergies, actions }: { patient: PatientCard; allergies?: AllergyItem[]; actions?: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Avatar text={initials(patient.name)} className="h-12 w-12 text-base" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-ink">{patient.name}</h1>
              <EhrBadge name={patient.ehrName} />
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {patient.age ?? '—'} y · {titleCase(patient.gender)} · DOB {formatDate(patient.birthDate)} · {patient.mrn ?? 'no MRN'}
              {patient.city ? ` · ${patient.city}` : ''}
            </p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {allergies && <AllergyBanner allergies={allergies} />}
    </div>
  )
}

export function AllergyBanner({ allergies }: { allergies: AllergyItem[] }) {
  if (allergies.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line bg-sunken/60 px-3 py-2 text-sm text-ink-soft">
        <ShieldCheck size={16} className="text-good" /> No known allergies recorded
      </div>
    )
  }
  const high = allergies.some((a) => a.criticality === 'high')
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2 text-sm ${high ? 'border-act/30 bg-act-soft text-act-ink' : 'border-watch/40 bg-watch-soft text-watch-ink'}`}>
      <span className="flex items-center gap-1.5 font-semibold">
        <ShieldAlert size={16} /> Allergies
      </span>
      {allergies.map((a) => (
        <span key={a.substance} className="flex items-center gap-1.5">
          <span className="font-medium">{a.substance}</span>
          <span className="opacity-80">
            {a.reactions.length ? a.reactions.join(', ') : a.category}
            {a.criticality === 'high' && ' · high criticality'}
          </span>
        </span>
      ))}
    </div>
  )
}
