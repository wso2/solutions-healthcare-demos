// FHIR R4 as the integration (/api) and the lab simulator (/lab-api) return it, and the adapters that turn
// it into the portal's view models (lib/api.ts). Only the resources and fields the portal reads are typed.
// The adapters are pure: the same payload always gives the same view, following the API contract's
// derivation rules (which replicate what the integration used to compute server-side).
import type {
  AllergyItem, Analyte, Assessment, AssessmentData, BiomarkerPoint, BiomarkerSeries, ConditionItem, EhrInfo, EncounterItem,
  ExplorerResult, ExplorerRow, FamilyHistoryItem, ImmunizationItem, LabCatalog, LabOrder, LabOrderPlaced, LabResultValue,
  LabResults, LabVisit, MedicationItem, PatientCard, PatientNotification, PatientSummary, ProcedureItem, SocialHistoryItem,
  SummaryFlag, SystemInfo, VitalSigns, VitalTrend,
} from './api'

// ── Code systems ──

export const LOINC = 'http://loinc.org'
export const SNOMED = 'http://snomed.info/sct'
export const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm'
export const LAB_TEST_CODE_SYSTEM = 'urn:demo:lab:test-code'
export const PLACER_ORDER_SYSTEM = 'urn:demo:longevity:placer-order'
export const LAB_RESULT_ID_SYSTEM = 'urn:demo:lab:result-id'
export const SUMMARY_SOURCE_SYSTEM = 'urn:demo:longevity:summary-source'

// ── Datatypes ──

export interface Coding { system?: string; version?: string; code?: string; display?: string }
export interface CodeableConcept { coding?: Coding[]; text?: string }
export interface Identifier { use?: string; type?: CodeableConcept; system?: string; value?: string }
export interface Reference { reference?: string; type?: string; identifier?: Identifier; display?: string }
export interface Quantity { value?: number; comparator?: string; unit?: string; system?: string; code?: string }
export type Age = Quantity
export interface Period { start?: string; end?: string }
export interface Range { low?: Quantity; high?: Quantity }
export interface HumanName { use?: string; text?: string; family?: string; given?: string[]; prefix?: string[]; suffix?: string[] }
export interface Address { use?: string; text?: string; line?: string[]; city?: string; state?: string; postalCode?: string; country?: string }
export interface ContactPoint { system?: string; value?: string; use?: string }
export interface Annotation { text: string; time?: string; authorString?: string; authorReference?: Reference }
export interface Attachment { contentType?: string; data?: string; url?: string; title?: string; creation?: string }
export interface Dosage { text?: string; timing?: unknown; route?: CodeableConcept }
export interface Meta { versionId?: string; lastUpdated?: string; profile?: string[]; tag?: Coding[] }
export interface Narrative { status: string; div: string }

interface ResourceBase {
  id?: string
  meta?: Meta
  text?: Narrative
}

// ── Resources ──

export interface Patient extends ResourceBase {
  resourceType: 'Patient'
  identifier?: Identifier[]
  active?: boolean
  name?: HumanName[]
  telecom?: ContactPoint[]
  gender?: string
  birthDate?: string
  address?: Address[]
}

export interface CompositionSection {
  title?: string
  code?: CodeableConcept
  text?: Narrative
  entry?: Reference[]
  emptyReason?: CodeableConcept
}

export interface Composition extends ResourceBase {
  resourceType: 'Composition'
  status: string
  type: CodeableConcept
  subject?: Reference
  date: string
  author?: Reference[]
  title: string
  section?: CompositionSection[]
}

export interface Condition extends ResourceBase {
  resourceType: 'Condition'
  clinicalStatus?: CodeableConcept
  verificationStatus?: CodeableConcept
  category?: CodeableConcept[]
  code?: CodeableConcept
  subject?: Reference
  onsetDateTime?: string
  abatementDateTime?: string
  recordedDate?: string
}

export interface AllergyIntoleranceReaction { manifestation?: CodeableConcept[]; severity?: string; description?: string }
export interface AllergyIntolerance extends ResourceBase {
  resourceType: 'AllergyIntolerance'
  clinicalStatus?: CodeableConcept
  category?: string[]
  criticality?: string
  code?: CodeableConcept
  patient?: Reference
  recordedDate?: string
  reaction?: AllergyIntoleranceReaction[]
}

export interface MedicationRequest extends ResourceBase {
  resourceType: 'MedicationRequest'
  status?: string
  intent?: string
  medicationCodeableConcept?: CodeableConcept
  subject?: Reference
  authoredOn?: string
  requester?: Reference
  dosageInstruction?: Dosage[]
  dispenseRequest?: { validityPeriod?: Period }
}

export interface MedicationStatement extends ResourceBase {
  resourceType: 'MedicationStatement'
  status?: string
  medicationCodeableConcept?: CodeableConcept
  subject?: Reference
  effectiveDateTime?: string
  effectivePeriod?: Period
  dosage?: Dosage[]
}

export interface Immunization extends ResourceBase {
  resourceType: 'Immunization'
  status?: string
  vaccineCode?: CodeableConcept
  patient?: Reference
  occurrenceDateTime?: string
}

export interface Procedure extends ResourceBase {
  resourceType: 'Procedure'
  status?: string
  code?: CodeableConcept
  subject?: Reference
  performedDateTime?: string
  performedPeriod?: Period
  reasonCode?: CodeableConcept[]
}

export interface ObservationReferenceRange { low?: Quantity; high?: Quantity; text?: string }
export interface ObservationComponent {
  code: CodeableConcept
  valueQuantity?: Quantity
  valueCodeableConcept?: CodeableConcept
  valueString?: string
  interpretation?: CodeableConcept[]
}
export interface Observation extends ResourceBase {
  resourceType: 'Observation'
  identifier?: Identifier[]
  basedOn?: Reference[]
  status?: string
  category?: CodeableConcept[]
  code?: CodeableConcept
  subject?: Reference
  effectiveDateTime?: string
  issued?: string
  performer?: Reference[]
  valueQuantity?: Quantity
  valueCodeableConcept?: CodeableConcept
  valueString?: string
  interpretation?: CodeableConcept[]
  referenceRange?: ObservationReferenceRange[]
  component?: ObservationComponent[]
}

export interface FamilyMemberHistoryCondition { code?: CodeableConcept; onsetAge?: Age; outcome?: CodeableConcept }
export interface FamilyMemberHistory extends ResourceBase {
  resourceType: 'FamilyMemberHistory'
  status?: string
  patient?: Reference
  relationship?: CodeableConcept
  condition?: FamilyMemberHistoryCondition[]
}

export interface Encounter extends ResourceBase {
  resourceType: 'Encounter'
  status?: string
  class?: Coding
  type?: CodeableConcept[]
  subject?: Reference
  participant?: { individual?: Reference }[]
  period?: Period
  reasonCode?: CodeableConcept[]
  serviceProvider?: Reference
}

export interface DetectedIssue extends ResourceBase {
  resourceType: 'DetectedIssue'
  status?: string
  code?: CodeableConcept
  severity?: 'high' | 'moderate' | 'low'
  patient?: Reference
  detail?: string
  evidence?: { code?: CodeableConcept[]; detail?: Reference[] }[]
}

export interface ServiceRequest extends ResourceBase {
  resourceType: 'ServiceRequest'
  identifier?: Identifier[]
  status?: string
  intent?: string
  code?: CodeableConcept
  orderDetail?: CodeableConcept[]
  subject?: Reference
  encounter?: Reference
  authoredOn?: string
  requester?: Reference
  specimen?: Reference[]
  note?: Annotation[]
}

export interface Provenance extends ResourceBase {
  resourceType: 'Provenance'
  target?: Reference[]
  occurredPeriod?: Period
  occurredDateTime?: string
  recorded?: string
  activity?: CodeableConcept
  agent?: { type?: CodeableConcept; who?: Reference }[]
  entity?: { role?: string; what?: Reference }[]
}

export interface Communication extends ResourceBase {
  resourceType: 'Communication'
  status?: string
  subject?: Reference
  sent?: string
  payload?: { contentString?: string; contentAttachment?: Attachment; contentReference?: Reference }[]
}

export interface Specimen extends ResourceBase {
  resourceType: 'Specimen'
  status?: string
  type?: CodeableConcept
  subject?: Reference
  request?: Reference[]
  collection?: { collector?: Reference; collectedDateTime?: string; collectedPeriod?: Period }
}

export interface DiagnosticReport extends ResourceBase {
  resourceType: 'DiagnosticReport'
  identifier?: Identifier[]
  basedOn?: Reference[]
  status?: string
  category?: CodeableConcept[]
  code?: CodeableConcept
  subject?: Reference
  effectiveDateTime?: string
  issued?: string
  performer?: Reference[]
  result?: Reference[]
  conclusion?: string
}

export interface DocumentReference extends ResourceBase {
  resourceType: 'DocumentReference'
  status?: string
  docStatus?: string
  type?: CodeableConcept
  subject?: Reference
  date?: string
  description?: string
  content?: { attachment: Attachment }[]
}

export type FhirResource =
  | Patient | Composition | Condition | AllergyIntolerance | MedicationRequest | MedicationStatement | Immunization
  | Procedure | Observation | FamilyMemberHistory | Encounter | DetectedIssue | ServiceRequest | Provenance
  | Communication | Specimen | DiagnosticReport | DocumentReference

export interface BundleEntry<R = FhirResource> {
  fullUrl?: string
  resource?: R
  search?: { mode?: 'match' | 'include' | 'outcome'; score?: number }
}

export interface Bundle<R = FhirResource> {
  resourceType: 'Bundle'
  id?: string
  meta?: Meta
  identifier?: Identifier
  type: 'document' | 'collection' | 'searchset' | 'transaction' | 'batch' | 'history' | string
  timestamp?: string
  total?: number
  entry?: BundleEntry<R>[]
}

// ── Readers over datatypes ──

/** The date part of a FHIR date or dateTime ("2024-03-01T09:00:00Z" → "2024-03-01"). */
export function dateOnly(dateTime?: string | null): string | undefined {
  if (dateTime == null) return undefined
  return dateTime.length >= 10 ? dateTime.slice(0, 10) : dateTime
}

/** The code of the first coding in `system`. */
export function codingCode(concept: CodeableConcept | undefined, system: string): string | undefined {
  return concept?.coding?.find((c) => c.system === system)?.code
}

/** A concept's text, else the first coding display. */
export function conceptText(concept?: CodeableConcept): string | undefined {
  if (!concept) return undefined
  if (concept.text) return concept.text
  return concept.coding?.find((c) => typeof c.display === 'string')?.display
}

/** A concept's text, else the first coding's display or code (the explorer's label). */
function conceptLabel(concept?: CodeableConcept): string | undefined {
  if (!concept) return undefined
  if (concept.text) return concept.text
  return concept.coding?.[0]?.display ?? concept.coding?.[0]?.code
}

const SEMANTIC_TAGS = ['disorder', 'finding', 'procedure', 'substance', 'situation', 'regime/therapy', 'observable entity',
  'organism', 'person', 'event', 'qualifier value']

/** "Hypertension (disorder)" → "Hypertension": SNOMED CT's semantic tags are noise to a reader. */
export function stripSemanticTag(text: string): string {
  const trimmed = text.trim()
  if (trimmed.endsWith(')')) {
    const open = trimmed.lastIndexOf(' (')
    if (open >= 0 && SEMANTIC_TAGS.includes(trimmed.slice(open + 2, -1))) return trimmed.slice(0, open)
  }
  return trimmed
}

/** The id in a reference: "Patient/123" → "123" (and the last path segment of an absolute URL). */
export function referenceId(reference?: string | null): string | undefined {
  if (!reference) return undefined
  const parts = reference.split('/')
  return parts[parts.length - 1] || undefined
}

const keyOf = (r: FhirResource) => `${r.resourceType}/${r.id ?? ''}`

/** Every resource in a Bundle, in entry order. */
export function bundleResources(bundle?: Bundle | null): FhirResource[] {
  return (bundle?.entry ?? []).map((e) => e.resource).filter((r): r is FhirResource => !!r)
}

/** A reference resolver over a Bundle: `Type/id` against resourceType + "/" + id, or a matching fullUrl. */
export function bundleResolver(bundle?: Bundle | null): (reference?: string) => FhirResource | undefined {
  const byKey = new Map<string, FhirResource>()
  for (const entry of bundle?.entry ?? []) {
    if (!entry.resource) continue
    byKey.set(keyOf(entry.resource), entry.resource)
    if (entry.fullUrl) byKey.set(entry.fullUrl, entry.resource)
  }
  return (reference) => {
    if (!reference) return undefined
    const direct = byKey.get(reference)
    if (direct) return direct
    // An absolute reference (".../Patient/123") resolves by its last two segments.
    const parts = reference.split('/')
    return parts.length >= 2 ? byKey.get(parts.slice(-2).join('/')) : undefined
  }
}

function ofType<T extends FhirResource['resourceType']>(resources: (FhirResource | undefined)[], type: T) {
  return resources.filter((r): r is Extract<FhirResource, { resourceType: T }> => r?.resourceType === type)
}

// ── Patients ──

/** The EHR facts a patient card needs: its display name and the identifier system of its MRNs. */
export type EhrRef = Pick<EhrInfo, 'name' | 'mrnSystem'>

export function patientName(patient?: Patient | null): string {
  const name = patient?.name?.[0]
  if (!name) return 'Unknown patient'
  if (name.text) return name.text
  const parts = [...(name.given ?? []), ...(name.family ? [name.family] : [])]
  return parts.join(' ').trim() || 'Unknown patient'
}

/** Age in whole years today. */
export function ageFrom(birthDate?: string | null): number | undefined {
  if (!birthDate || birthDate.length < 10) return undefined
  const [year, month, day] = [Number(birthDate.slice(0, 4)), Number(birthDate.slice(5, 7)), Number(birthDate.slice(8, 10))]
  if ([year, month, day].some(Number.isNaN)) return undefined
  const today = new Date()
  let age = today.getFullYear() - year
  const m = today.getMonth() + 1
  if (m < month || (m === month && today.getDate() < day)) age -= 1
  return age
}

export function patientCard(patient: Patient, ehr: string, ehrInfo?: EhrRef): PatientCard {
  const mrnSystem = ehrInfo?.mrnSystem
  return {
    ehr,
    ehrName: ehrInfo?.name ?? ehr,
    id: patient.id ?? '',
    name: patientName(patient),
    gender: patient.gender,
    birthDate: patient.birthDate,
    age: ageFrom(patient.birthDate),
    mrn: mrnSystem ? patient.identifier?.find((i) => i.system === mrnSystem)?.value : undefined,
    city: patient.address?.[0]?.city,
    phone: patient.telecom?.find((t) => t.system === 'phone')?.value,
  }
}

export function patientCardsFromBundle(bundle: Bundle, ehr: string, ehrInfo?: EhrRef): PatientCard[] {
  return ofType(bundleResources(bundle), 'Patient').map((p) => patientCard(p, ehr, ehrInfo))
}

// ── Lab catalog ──

/** The catalog analyte for a LOINC code, including equivalent codes (catalog `aliases`). */
export function analyteFor(catalog: LabCatalog | undefined, loinc: string): Analyte | undefined {
  if (!catalog) return undefined
  const code = catalog.aliases?.[loinc] ?? loinc
  return catalog.analytes.find((a) => a.code === code)
}

// ── Patient summary (enriched IPS document) ──

export const IPS_SECTION = {
  problems: '11450-4',
  allergies: '48765-2',
  medications: '10160-0',
  immunizations: '11369-6',
  results: '30954-2',
  vitals: '8716-3',
  procedures: '47519-4',
  social: '29762-2',
  family: '10157-6',
  encounters: '46240-8',
  alerts: '104605-1',
  plan: '18776-5',
} as const

const LOINC_BP_PANEL = '85354-9'
const LOINC_SYSTOLIC = '8480-6'
const LOINC_DIASTOLIC = '8462-4'
const LOINC_BMI = '39156-5'
const LOINC_WEIGHT = '29463-7'
const LOINC_HEIGHT = '8302-2'
const LOINC_HEART_RATE = '8867-4'
const LOINC_RESP_RATE = '9279-1'
const LOINC_TEMPERATURE = '8310-5'
const LOINC_SMOKING = '72166-2'
const LOINC_AUDIT_C = '75626-2'

/** A change smaller than this (in percent) between first and last result reads as stable. */
const STABLE_CHANGE_PCT = 3

const byDateDesc = (a?: string | null, b?: string | null) => (b ?? '').localeCompare(a ?? '')
const round1 = (n: number) => Math.round(n * 10) / 10

function conditionItem(c: Condition): ConditionItem {
  return {
    display: stripSemanticTag(conceptText(c.code) ?? 'Unspecified condition'),
    code: codingCode(c.code, ICD10) ?? codingCode(c.code, SNOMED),
    onset: dateOnly(c.onsetDateTime),
    abatement: dateOnly(c.abatementDateTime),
    status: c.clinicalStatus?.coding?.[0]?.code,
  }
}

const SEVERITY_RANK: Record<string, number> = { mild: 1, moderate: 2, severe: 3 }

function allergyItem(a: AllergyIntolerance): AllergyItem {
  const reactions: string[] = []
  let severity: string | undefined
  for (const reaction of a.reaction ?? []) {
    for (const manifestation of reaction.manifestation ?? []) {
      const text = conceptText(manifestation)
      if (text) reactions.push(stripSemanticTag(text))
    }
    const s = reaction.severity
    if (s && (SEVERITY_RANK[s] ?? 0) > (severity ? SEVERITY_RANK[severity] ?? 0 : 0)) severity = s
  }
  const substance = conceptText(a.code)
  return {
    substance: substance ? stripSemanticTag(substance) : 'Unknown substance',
    category: a.category?.[0],
    criticality: a.criticality,
    reactions,
    severity,
    recorded: dateOnly(a.recordedDate),
  }
}

function medicationItem(m: MedicationRequest | MedicationStatement): MedicationItem {
  if (m.resourceType === 'MedicationRequest') {
    return {
      display: conceptText(m.medicationCodeableConcept) ?? 'Medication',
      status: m.status,
      since: dateOnly(m.authoredOn),
      until: dateOnly(m.dispenseRequest?.validityPeriod?.end),
      dosage: m.dosageInstruction?.[0]?.text,
      source: 'prescribed',
    }
  }
  return {
    display: conceptText(m.medicationCodeableConcept) ?? 'Medication',
    status: m.status,
    since: dateOnly(m.effectivePeriod?.start ?? m.effectiveDateTime),
    until: dateOnly(m.effectivePeriod?.end),
    dosage: m.dosage?.[0]?.text,
    source: 'patient-reported',
  }
}

function immunizationItem(i: Immunization): ImmunizationItem {
  return { vaccine: conceptText(i.vaccineCode) ?? 'Vaccine', date: dateOnly(i.occurrenceDateTime), status: i.status }
}

function procedureItem(p: Procedure): ProcedureItem {
  const display = conceptText(p.code)
  return {
    display: display ? stripSemanticTag(display) : 'Procedure',
    date: dateOnly(p.performedPeriod?.start ?? p.performedDateTime),
    status: p.status,
  }
}

function socialHistoryItems(observations: Observation[]): SocialHistoryItem[] {
  const items: SocialHistoryItem[] = []
  for (const o of observations) {
    const code = codingCode(o.code, LOINC)
    const coded = conceptText(o.valueCodeableConcept)
    const value = coded != null ? stripSemanticTag(coded) : o.valueQuantity?.value != null ? String(o.valueQuantity.value) : undefined
    if (value == null) continue
    const label = code === LOINC_SMOKING ? 'Smoking status' : code === LOINC_AUDIT_C ? 'Alcohol use (AUDIT-C score)' : conceptText(o.code) ?? 'Social history'
    items.push({ label, value, date: dateOnly(o.effectiveDateTime) })
  }
  return items
}

function familyHistoryItems(histories: FamilyMemberHistory[]): FamilyHistoryItem[] {
  return histories.flatMap((h) => {
    const relationship = conceptText(h.relationship) ?? 'relative'
    return (h.condition ?? []).map((c) => ({
      relationship,
      condition: conceptText(c.code) ?? 'condition',
      onsetAge: c.onsetAge?.value != null ? Math.trunc(c.onsetAge.value) : undefined,
    }))
  })
}

function encounterItem(e: Encounter): EncounterItem {
  const type = e.type?.[0] ? conceptText(e.type[0]) : undefined
  return {
    id: e.id ?? '',
    date: dateOnly(e.period?.start),
    type: type ? stripSemanticTag(type) : 'Visit',
    reason: e.reasonCode?.[0] ? conceptText(e.reasonCode[0]) : undefined,
    status: e.status,
    provider: e.serviceProvider?.display,
  }
}

function bloodPressure(o: Observation): [number | undefined, number | undefined] {
  let systolic: number | undefined
  let diastolic: number | undefined
  for (const component of o.component ?? []) {
    const code = codingCode(component.code, LOINC)
    if (code === LOINC_SYSTOLIC) systolic = component.valueQuantity?.value
    else if (code === LOINC_DIASTOLIC) diastolic = component.valueQuantity?.value
  }
  return [systolic, diastolic]
}

/** The latest of each vital sign. */
export function latestVitals(vitals: Observation[]): VitalSigns {
  const result: VitalSigns = {}
  const newestFirst = [...vitals].sort((a, b) => byDateDesc(a.effectiveDateTime, b.effectiveDateTime))
  for (const o of newestFirst) {
    const code = codingCode(o.code, LOINC)
    const value = o.valueQuantity?.value
    if (code === LOINC_BP_PANEL && result.systolic == null) {
      const [systolic, diastolic] = bloodPressure(o)
      result.systolic = systolic
      result.diastolic = diastolic
      result.bloodPressureDate = dateOnly(o.effectiveDateTime)
    } else if (code === LOINC_BMI && result.bmi == null) result.bmi = value
    else if (code === LOINC_WEIGHT && result.weightKg == null) result.weightKg = value
    else if (code === LOINC_HEIGHT && result.heightCm == null) result.heightCm = value
    else if (code === LOINC_HEART_RATE && result.heartRate == null) result.heartRate = value
    else if (code === LOINC_RESP_RATE && result.respiratoryRate == null) result.respiratoryRate = value
    else if (code === LOINC_TEMPERATURE && result.temperature == null) result.temperature = value
  }
  return result
}

/** Blood pressure, weight, BMI and heart rate over time, oldest first; only those with readings. */
export function vitalTrends(vitals: Observation[]): VitalTrend[] {
  const tracked: [string, string, string][] = [
    [LOINC_BP_PANEL, 'Blood pressure', 'mmHg'],
    [LOINC_WEIGHT, 'Weight', 'kg'],
    [LOINC_BMI, 'BMI', 'kg/m2'],
    [LOINC_HEART_RATE, 'Heart rate', '/min'],
  ]
  const trends: VitalTrend[] = []
  for (const [code, name, unit] of tracked) {
    const points: VitalTrend['points'] = []
    for (const o of vitals) {
      const date = dateOnly(o.effectiveDateTime)
      if (codingCode(o.code, LOINC) !== code || date == null) continue
      if (code === LOINC_BP_PANEL) {
        const [systolic, diastolic] = bloodPressure(o)
        if (systolic != null) points.push({ date, value: systolic, value2: diastolic })
      } else if (o.valueQuantity?.value != null) {
        points.push({ date, value: o.valueQuantity.value })
      }
    }
    if (points.length) trends.push({ code, name, unit, points: points.sort((a, b) => a.date.localeCompare(b.date)) })
  }
  return trends
}

/**
 * One series per catalog analyte, in catalog order. Results filed under an equivalent LOINC code join the
 * catalog analyte's series; analytes the clinic does not interpret are left to the explorer.
 */
export function biomarkerSeries(labs: Observation[], catalog: LabCatalog | undefined, ehrName: string): BiomarkerSeries[] {
  if (!catalog) return []
  const groups = new Map<string, Observation[]>()
  for (const o of labs) {
    const code = codingCode(o.code, LOINC)
    if (code == null || o.valueQuantity?.value == null || o.effectiveDateTime == null) continue
    const analyte = analyteFor(catalog, code)
    if (!analyte) continue
    groups.set(analyte.code, [...(groups.get(analyte.code) ?? []), o])
  }
  return catalog.analytes
    .filter((a) => groups.has(a.code))
    .map((analyte) => {
      const ordered = [...groups.get(analyte.code)!].sort((a, b) => a.effectiveDateTime!.localeCompare(b.effectiveDateTime!))
      const last = ordered[ordered.length - 1]
      const points: BiomarkerPoint[] = ordered.map((o) => ({
        date: dateOnly(o.effectiveDateTime)!,
        value: o.valueQuantity!.value!,
        interpretation: o.interpretation?.[0]?.coding?.[0]?.code,
        source: o.performer?.[0]?.display ?? ehrName,
      }))
      const latest = points[points.length - 1].value
      const first = points[0].value
      const changePct = points.length > 1 && first !== 0 ? round1(((latest - first) / first) * 100) : undefined
      const trend: BiomarkerSeries['trend'] = changePct == null
        ? 'single'
        : Math.abs(changePct) < STABLE_CHANGE_PCT ? 'stable' : changePct > 0 ? 'rising' : 'falling'
      const low = last.referenceRange?.[0]?.low?.value
      const high = last.referenceRange?.[0]?.high?.value
      const status: BiomarkerSeries['status'] = high != null && latest > high ? 'high' : low != null && latest < low ? 'low' : 'normal'
      return {
        code: analyte.code,
        name: analyte.name,
        unit: last.valueQuantity?.unit ?? analyte.unit,
        points,
        latest,
        latestDate: points[points.length - 1].date,
        previous: points.length > 1 ? points[points.length - 2].value : undefined,
        changePct,
        trend,
        status,
        referenceLow: low,
        referenceHigh: high,
        longevityTarget: analyte.longevityTarget,
      }
    })
}

const FLAG_SEVERITY: Record<string, SummaryFlag['severity']> = { high: 'concern', moderate: 'watch', low: 'info' }

function summaryFlag(issue: DetectedIssue): SummaryFlag {
  return {
    severity: FLAG_SEVERITY[issue.severity ?? ''] ?? 'info',
    title: issue.code?.text ?? conceptText(issue.code) ?? 'Flag',
    detail: issue.detail ?? '',
    codes: (issue.evidence ?? []).flatMap((e) => (e.code ?? []).flatMap((c) => (c.coding ?? []).map((x) => x.code).filter((x): x is string => !!x))),
  }
}

function careGap(request: ServiceRequest): PatientSummary['careGaps'][number] {
  return {
    title: request.code?.text ?? conceptText(request.code) ?? 'Care gap',
    detail: request.note?.[0]?.text ?? '',
    suggestedTests: (request.orderDetail ?? [])
      .map((d) => codingCode(d, LAB_TEST_CODE_SYSTEM) ?? d.coding?.[0]?.code)
      .filter((c): c is string => !!c),
  }
}

/**
 * The patient summary from the integration's enriched IPS document (Composition first, Provenance last).
 * Sections are read in the Composition's display order.
 */
export function summaryFromIps(bundle: Bundle, ehr: string, ehrInfo: EhrRef | undefined, catalog: LabCatalog | undefined): PatientSummary {
  const resources = bundleResources(bundle)
  const resolve = bundleResolver(bundle)
  const composition = ofType(resources, 'Composition')[0]
  const patient = (resolve(composition?.subject?.reference) as Patient | undefined) ?? ofType(resources, 'Patient')[0]
  const section = (code: string) => {
    const s = composition?.section?.find((x) => x.code?.coding?.some((c) => c.code === code))
    return (s?.entry ?? []).map((e) => resolve(e.reference))
  }
  const card = patient
    ? patientCard(patient, ehr, ehrInfo)
    : { ehr, ehrName: ehrInfo?.name ?? ehr, id: referenceId(composition?.subject?.reference) ?? '', name: 'Unknown patient' }
  const vitalObservations = ofType(section(IPS_SECTION.vitals), 'Observation')
  const provenance = ofType(resources, 'Provenance').find((p) =>
    p.target?.some((t) => composition && (t.reference === keyOf(composition) || resolve(t.reference) === composition)),
  ) ?? ofType(resources, 'Provenance').at(-1)
  const source = provenance?.activity?.coding?.find((c) => c.system === SUMMARY_SOURCE_SYSTEM)?.code ?? provenance?.activity?.coding?.[0]?.code

  return {
    patient: card,
    source: source === 'summary-operation' ? 'summary-operation' : 'composed-search',
    fhirQueries: (provenance?.entity ?? []).map((e) => e.what?.display).filter((q): q is string => !!q),
    conditions: ofType(section(IPS_SECTION.problems), 'Condition').map(conditionItem),
    allergies: ofType(section(IPS_SECTION.allergies), 'AllergyIntolerance').map(allergyItem),
    medications: section(IPS_SECTION.medications)
      .filter((r): r is MedicationRequest | MedicationStatement => r?.resourceType === 'MedicationRequest' || r?.resourceType === 'MedicationStatement')
      .map(medicationItem),
    immunizations: ofType(section(IPS_SECTION.immunizations), 'Immunization').map(immunizationItem),
    procedures: ofType(section(IPS_SECTION.procedures), 'Procedure').map(procedureItem),
    socialHistory: socialHistoryItems(ofType(section(IPS_SECTION.social), 'Observation')),
    familyHistory: familyHistoryItems(ofType(section(IPS_SECTION.family), 'FamilyMemberHistory')),
    encounters: ofType(section(IPS_SECTION.encounters), 'Encounter').map(encounterItem),
    vitals: latestVitals(vitalObservations),
    vitalTrends: vitalTrends(vitalObservations),
    biomarkers: biomarkerSeries(ofType(section(IPS_SECTION.results), 'Observation'), catalog, card.ehrName),
    flags: ofType(section(IPS_SECTION.alerts), 'DetectedIssue').map(summaryFlag),
    careGaps: ofType(section(IPS_SECTION.plan), 'ServiceRequest').map(careGap),
    generatedAt: bundle.timestamp ?? composition?.date ?? '',
    bundle,
  }
}

// ── EHR data explorer ──

/** The explorer kind of a resource. */
export function explorerKind(r: FhirResource): string {
  switch (r.resourceType) {
    case 'Encounter': return 'encounter'
    case 'Condition': return 'problem'
    case 'MedicationRequest': return 'medication'
    case 'MedicationStatement': return 'medication-reported'
    case 'DiagnosticReport': return 'report'
    case 'AllergyIntolerance': return 'allergy'
    case 'Immunization': return 'immunization'
    case 'Procedure': return 'procedure'
    case 'DocumentReference': return 'note'
    case 'Observation': {
      const codes = (r.category ?? []).flatMap((c) => (c.coding ?? []).map((x) => x.code))
      if (codes.includes('laboratory')) return 'lab'
      if (codes.includes('vital-signs')) return 'vital'
      if (codes.includes('social-history')) return 'social'
      return 'observation'
    }
    default: return r.resourceType
  }
}

function joinPresent(parts: (string | null | undefined)[]): string | undefined {
  const present = parts.filter((p): p is string => !!p)
  return present.length ? present.join(' · ') : undefined
}

function excerpt(text: string, maxLength: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat
}

const num = (n?: number | null) => (n == null ? undefined : String(n))

/** The text of a clinical note: its first attachment, when it is inline text. */
export function noteText(d: DocumentReference): string | undefined {
  const attachment = d.content?.[0]?.attachment
  const data = attachment?.data
  if (!data || !(attachment.contentType ?? 'text/plain').startsWith('text/')) return undefined
  try {
    const binary = atob(data)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

function observationRow(ref: string, kind: string, o: Observation): Omit<ExplorerRow, 'resource'> {
  // LOINC long names carry the property in brackets ("Sodium [Moles/volume] in Blood"); drop it for reading.
  const title = (conceptLabel(o.code) ?? 'Observation').replace(/\s*\[[^\]]*\]/g, '')
  const date = o.effectiveDateTime
  const flag = o.interpretation?.[0]?.coding?.[0]?.code
  const code = o.code?.coding?.[0]?.code
  if (code === LOINC_BP_PANEL && o.component?.length) {
    let systolic: string | undefined
    let diastolic: string | undefined
    for (const component of o.component) {
      const componentCode = component.code?.coding?.[0]?.code
      if (componentCode === LOINC_SYSTOLIC) systolic = num(component.valueQuantity?.value)
      else if (componentCode === LOINC_DIASTOLIC) diastolic = num(component.valueQuantity?.value)
    }
    return { ref, kind, date, title: 'Blood pressure', value: `${systolic ?? '?'}/${diastolic ?? '?'}`, unit: 'mmHg', status: o.status, code }
  }
  let value = num(o.valueQuantity?.value)
  const unit = o.valueQuantity?.unit
  if (value == null) {
    const coded = conceptLabel(o.valueCodeableConcept)
    value = coded != null ? stripSemanticTag(coded) : o.valueString
  }
  const low = num(o.referenceRange?.[0]?.low?.value)
  const high = num(o.referenceRange?.[0]?.high?.value)
  const range = low != null && high != null ? `ref ${low}–${high}` : high != null ? `ref < ${high}` : low != null ? `ref > ${low}` : undefined
  return { ref, kind, date, title: title.length > 60 ? excerpt(title, 60) : title, value, unit, flag, detail: range, status: o.status, code }
}

/** One resource as an explorer row (keeps the resource, so a selection can be sent as FHIR). */
export function explorerRow(r: FhirResource): ExplorerRow {
  const kind = explorerKind(r)
  const ref = keyOf(r)
  const row = ((): Omit<ExplorerRow, 'resource'> => {
    switch (r.resourceType) {
      case 'Encounter':
        return {
          ref, kind, date: r.period?.start,
          title: stripSemanticTag(conceptLabel(r.type?.[0]) ?? 'Visit'),
          detail: joinPresent([conceptLabel(r.reasonCode?.[0]), r.serviceProvider?.display, r.participant?.[0]?.individual?.display]),
          status: r.status,
        }
      case 'Condition':
        return {
          ref, kind, date: r.onsetDateTime ?? r.recordedDate,
          title: stripSemanticTag(conceptLabel(r.code) ?? 'Condition'),
          detail: r.abatementDateTime ? `Resolved ${r.abatementDateTime.slice(0, 10)}` : undefined,
          status: r.clinicalStatus?.coding?.[0]?.code,
          code: r.code?.coding?.[0]?.code,
        }
      case 'MedicationRequest':
        return {
          ref, kind, date: r.authoredOn,
          title: conceptLabel(r.medicationCodeableConcept) ?? 'Medication',
          detail: joinPresent([r.dosageInstruction?.[0]?.text, r.requester?.display]),
          status: r.status,
          code: r.medicationCodeableConcept?.coding?.[0]?.code,
        }
      case 'MedicationStatement':
        return {
          ref, kind, date: r.effectivePeriod?.start ?? r.effectiveDateTime,
          title: conceptLabel(r.medicationCodeableConcept) ?? 'Medication',
          detail: joinPresent(['Patient reported', r.dosage?.[0]?.text]),
          status: r.status,
          code: r.medicationCodeableConcept?.coding?.[0]?.code,
        }
      case 'Observation':
        return observationRow(ref, kind, r)
      case 'DiagnosticReport':
        return {
          ref, kind, date: r.effectiveDateTime ?? r.issued,
          title: conceptLabel(r.code) ?? 'Lab report',
          detail: `${r.result?.length ?? 0} results`,
          status: r.status,
          code: r.code?.coding?.[0]?.code,
        }
      case 'AllergyIntolerance': {
        const reactions = (r.reaction ?? []).flatMap((x) => (x.manifestation ?? []).map(conceptLabel).filter((l): l is string => !!l).map(stripSemanticTag))
        return {
          ref, kind, date: r.recordedDate,
          title: stripSemanticTag(conceptLabel(r.code) ?? 'Allergy'),
          detail: joinPresent([r.category?.[0], reactions.length ? reactions.join(', ') : undefined]),
          flag: r.criticality,
          status: r.clinicalStatus?.coding?.[0]?.code,
          code: r.code?.coding?.[0]?.code,
        }
      }
      case 'Immunization':
        return {
          ref, kind, date: r.occurrenceDateTime,
          title: conceptLabel(r.vaccineCode) ?? 'Vaccine',
          status: r.status,
          code: r.vaccineCode?.coding?.[0]?.code,
        }
      case 'Procedure':
        return {
          ref, kind, date: r.performedPeriod?.start ?? r.performedDateTime,
          title: stripSemanticTag(conceptLabel(r.code) ?? 'Procedure'),
          detail: conceptLabel(r.reasonCode?.[0]),
          status: r.status,
          code: r.code?.coding?.[0]?.code,
        }
      case 'DocumentReference': {
        const text = noteText(r)
        return {
          ref, kind, date: r.date,
          title: r.description ?? conceptLabel(r.type) ?? 'Clinical note',
          detail: text != null ? excerpt(text, 180) : undefined,
          status: r.docStatus ?? r.status,
          text,
        }
      }
      default:
        return { ref, kind, date: undefined, title: r.resourceType }
    }
  })()
  return { ...row, resource: r }
}

/** The explorer's result from the records Bundle (matching resources, newest first, then one Provenance). */
export function explorerFromBundle(bundle: Bundle, ehr: string, patientId: string): ExplorerResult {
  const resources = bundleResources(bundle)
  const provenance = ofType(resources, 'Provenance').at(-1)
  const rows: ExplorerRow[] = []
  const seen = new Set<string>()
  for (const r of resources) {
    if (r.resourceType === 'Provenance') continue
    const row = explorerRow(r)
    if (seen.has(row.ref)) continue
    seen.add(row.ref)
    rows.push(row)
  }
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + 1
  const start = provenance?.occurredPeriod?.start
  const end = provenance?.occurredPeriod?.end
  const durationMs = start && end ? Math.max(0, Date.parse(end) - Date.parse(start)) : 0
  return {
    ehr,
    patientId,
    rows,
    counts,
    queries: (provenance?.entity ?? []).map((e) => e.what?.display).filter((q): q is string => !!q),
    fetchedAt: provenance?.recorded ?? bundle.timestamp ?? '',
    durationMs: Number.isNaN(durationMs) ? 0 : durationMs,
  }
}

// ── The assessment's order, notification, lab visit and results ──

const identifierValue = (identifiers: Identifier[] | undefined, system: string) => identifiers?.find((i) => i.system === system)?.value

/** Test codes (LAB_TEST_CODE_SYSTEM) in a ServiceRequest's orderDetail. */
function orderedTests(request?: ServiceRequest): Coding[] {
  return (request?.orderDetail ?? []).flatMap((d) => (d.coding ?? []).filter((c) => c.system === LAB_TEST_CODE_SYSTEM && c.code))
}

/** The order from its collection Bundle: [0] the EHR's ServiceRequest, [1] the lab's. */
export function labOrderFromBundle(bundle: Bundle): LabOrderPlaced {
  const [ehrRequest, labRequest] = (bundle.entry ?? []).map((e) => e.resource) as (ServiceRequest | undefined)[]
  const tests = orderedTests(ehrRequest).length ? orderedTests(ehrRequest) : orderedTests(labRequest)
  return {
    labPatientId: referenceId(labRequest?.subject?.reference) ?? '',
    labServiceRequestId: labRequest?.id ?? '',
    ehrServiceRequestId: ehrRequest?.id ?? '',
    placerOrderId: identifierValue(ehrRequest?.identifier, PLACER_ORDER_SYSTEM) ?? identifierValue(labRequest?.identifier, PLACER_ORDER_SYSTEM) ?? '',
    tests: tests.map((c) => c.code!),
  }
}

/** The patient's notification from the Communication filed in the EHR: payload[0] the message, the rest instructions. */
export function notificationFromCommunication(communication: Communication, labName: string): PatientNotification {
  const texts = (communication.payload ?? []).map((p) => p.contentString)
  return {
    communicationId: communication.id ?? '',
    message: texts[0] ?? '',
    instructions: texts.slice(1).filter((t): t is string => !!t),
    labName,
  }
}

export function labVisitFromSpecimen(specimen: Specimen): LabVisit {
  return {
    specimenId: specimen.id ?? '',
    collectedAt: specimen.collection?.collectedDateTime ?? '',
    collectedBy: specimen.collection?.collector?.display ?? '',
  }
}

/** One lab result as filed in the EHR; undefined unless it has a LOINC code and a numeric value. */
export function labResultValue(o: Observation, catalog?: LabCatalog): LabResultValue | undefined {
  const code = codingCode(o.code, LOINC)
  const value = o.valueQuantity?.value
  if (code == null || typeof value !== 'number') return undefined
  const analyte = analyteFor(catalog, code)
  return {
    code,
    name: analyte?.name ?? conceptText(o.code) ?? code,
    value,
    unit: o.valueQuantity?.unit ?? analyte?.unit ?? '',
    interpretation: o.interpretation?.[0]?.coding?.[0]?.code,
    referenceLow: o.referenceRange?.[0]?.low?.value,
    referenceHigh: o.referenceRange?.[0]?.high?.value,
    effectiveDate: dateOnly(o.effectiveDateTime) ?? '',
  }
}

/** The results from their collection Bundle: [0] the DiagnosticReport as filed in the EHR, then its Observations. */
export function labResultsFromBundle(bundle: Bundle, catalog?: LabCatalog): LabResults {
  const resources = bundleResources(bundle)
  const report = ofType(resources, 'DiagnosticReport')[0]
  return {
    diagnosticReportId: identifierValue(report?.identifier, LAB_RESULT_ID_SYSTEM) ?? report?.id ?? '',
    ehrDiagnosticReportId: report?.id ?? '',
    status: report?.status ?? '',
    issued: report?.issued ?? '',
    results: ofType(resources, 'Observation').map((o) => labResultValue(o, catalog)).filter((r): r is LabResultValue => !!r),
  }
}

// ── Lab console ──

/** The lab's orders from its searchset: ServiceRequests (match) with their Patient, Specimen and DiagnosticReport (include). */
export function labOrdersFromBundle(bundle: Bundle): LabOrder[] {
  const entries = bundle.entry ?? []
  const resources = bundleResources(bundle)
  const resolve = bundleResolver(bundle)
  const hasModes = entries.some((e) => e.search?.mode)
  const orders = entries
    .filter((e) => e.resource?.resourceType === 'ServiceRequest' && (!hasModes || e.search?.mode === 'match'))
    .map((e) => e.resource as ServiceRequest)
  const reports = ofType(resources, 'DiagnosticReport')
  const specimens = ofType(resources, 'Specimen')
  return orders.map((order) => {
    const orderKey = `ServiceRequest/${order.id ?? ''}`
    const basedOnOrder = (refs?: Reference[]) => (refs ?? []).some((b) => b.reference === orderKey || (b.reference && resolve(b.reference) === order))
    const patient = resolve(order.subject?.reference) as Patient | undefined
    const specimenRef = order.specimen?.[0]?.reference
    const specimen = (resolve(specimenRef) as Specimen | undefined) ?? specimens.find((s) => basedOnOrder(s.request))
    const report = reports.find((r) => basedOnOrder(r.basedOn))
    const status: LabOrder['status'] = order.status === 'completed' || report
      ? 'resulted'
      : specimen || specimenRef ? 'collected' : 'awaiting-patient'
    return {
      id: order.id ?? '',
      placerOrderId: identifierValue(order.identifier, PLACER_ORDER_SYSTEM),
      patientId: referenceId(order.subject?.reference) ?? '',
      patientName: patient ? patientName(patient) : order.subject?.display ?? 'Unknown patient',
      mrn: patient?.identifier?.[0]?.value,
      tests: orderedTests(order).map((c) => ({ code: c.code!, name: c.display ?? c.code! })),
      authoredOn: order.authoredOn,
      requester: order.requester?.display,
      status,
      specimenId: referenceId(specimenRef) ?? specimen?.id,
      collectedAt: specimen?.collection?.collectedDateTime,
      reportId: report?.id,
    }
  })
}

// ── The assessment, as the screens read it ──

/** The assessment's data with its FHIR payloads turned into view models. */
export interface AssessmentViewData extends Omit<AssessmentData, 'summary' | 'labOrder' | 'patientNotification' | 'labVisit' | 'labResults'> {
  summary?: PatientSummary
  labOrder?: LabOrderPlaced
  patientNotification?: PatientNotification
  labVisit?: LabVisit
  labResults?: LabResults
}

export interface AssessmentView extends Omit<Assessment, 'data'> {
  data: AssessmentViewData
}

export function assessmentView(assessment: Assessment, system?: SystemInfo, catalog?: LabCatalog): AssessmentView {
  const d = assessment.data
  const ehrInfo: EhrRef = system?.ehrs.find((e) => e.id === assessment.ehr) ?? { name: assessment.ehrName, mrnSystem: '' }
  return {
    ...assessment,
    data: {
      ...d,
      summary: d.summary ? summaryFromIps(d.summary, assessment.ehr, ehrInfo, catalog) : undefined,
      labOrder: d.labOrder ? labOrderFromBundle(d.labOrder) : undefined,
      patientNotification: d.patientNotification ? notificationFromCommunication(d.patientNotification, system?.lab.name ?? 'the lab') : undefined,
      labVisit: d.labVisit ? labVisitFromSpecimen(d.labVisit) : undefined,
      labResults: d.labResults ? labResultsFromBundle(d.labResults, catalog) : undefined,
    },
  }
}
