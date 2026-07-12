import type { Patient, Condition, Medication, Observation, Procedure, DocumentRef, Coverage } from '../data/types';

// Minimal FHIR type shapes from Cerner
interface FHIRPatient {
  id: string;
  name?: Array<{ family?: string; given?: string[] }>;
  birthDate?: string;
  gender?: string;
  identifier?: Array<{
    type?: { coding?: Array<{ code?: string }> };
    value?: string;
  }>;
}

interface FHIRBundle {
  entry?: Array<{ resource?: unknown }>;
}

interface FHIRCondition {
  id: string;
  code?: { coding?: Array<{ code?: string; display?: string }>; text?: string };
  onsetDateTime?: string;
  onsetPeriod?: { start?: string };
}

interface FHIRMedicationRequest {
  id: string;
  status?: string;
  medicationCodeableConcept?: {
    coding?: Array<{ display?: string }>;
    text?: string;
  };
  medicationReference?: { display?: string };
  authoredOn?: string;
  reasonCode?: Array<{ text?: string; coding?: Array<{ display?: string }> }>;
  dispenseRequest?: { validityPeriod?: { end?: string } };
}

interface FHIRObservation {
  id: string;
  code?: { coding?: Array<{ code?: string; display?: string }>; text?: string };
  valueQuantity?: { value?: number; unit?: string };
  valueString?: string;
  effectiveDateTime?: string;
}

interface FHIRProcedure {
  id: string;
  code?: { coding?: Array<{ code?: string; display?: string }>; text?: string };
  performedDateTime?: string;
  performedPeriod?: { start?: string; end?: string };
  status?: string;
  outcome?: { text?: string; coding?: Array<{ display?: string }> };
}

interface FHIRDocumentReference {
  id: string;
  type?: { coding?: Array<{ display?: string; code?: string }>; text?: string };
  date?: string;
  status?: string;
  description?: string;
  content?: Array<{
    attachment?: {
      contentType?: string;
      url?: string;
      data?: string;
      title?: string;
    };
  }>;
}

interface FHIRCoverage {
  id: string;
  status?: string;
  payor?: Array<{ display?: string; reference?: string }>;
  subscriberId?: string;
  relationship?: { coding?: Array<{ display?: string; code?: string }> };
  period?: { start?: string; end?: string };
}

function computeAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export function mapFHIRPatientBase(
  fhir: FHIRPatient,
): Omit<Patient, 'conditions' | 'medications' | 'procedures' | 'observations' | 'notes' | 'documents' | 'coverages'> {
  const nameEntry = fhir.name?.[0];
  const given = nameEntry?.given?.join(' ') ?? '';
  const family = nameEntry?.family ?? '';
  const name = [given, family].filter(Boolean).join(' ') || 'Unknown';

  const mrn =
    fhir.identifier?.find((i) =>
      i.type?.coding?.some((c) => c.code === 'MR' || c.code === 'MRN'),
    )?.value ?? fhir.id;

  const dob = fhir.birthDate ?? '';

  return {
    id: fhir.id,
    name,
    dob,
    age: dob ? computeAge(dob) : 0,
    gender: fhir.gender ?? 'unknown',
    mrn,
    insurance: '',
    bmi: 0,
  };
}

export function mapFHIRConditions(bundle: FHIRBundle): Condition[] {
  return (bundle.entry ?? [])
    .map((e) => e.resource as FHIRCondition)
    .filter(Boolean)
    .map((c) => ({
      id: c.id,
      code: c.code?.coding?.[0]?.code ?? '',
      display: c.code?.coding?.[0]?.display ?? c.code?.text ?? 'Unknown Condition',
      onset:
        c.onsetDateTime?.split('T')[0] ?? c.onsetPeriod?.start?.split('T')[0] ?? '',
    }));
}

export function mapFHIRMedications(bundle: FHIRBundle): Medication[] {
  return (bundle.entry ?? [])
    .map((e) => e.resource as FHIRMedicationRequest)
    .filter(Boolean)
    .map((m) => {
      const rawStatus = m.status ?? '';
      const status: Medication['status'] =
        rawStatus === 'active' ? 'active' : rawStatus === 'stopped' ? 'stopped' : 'completed';
      return {
        id: m.id,
        name:
          m.medicationCodeableConcept?.coding?.[0]?.display ??
          m.medicationCodeableConcept?.text ??
          m.medicationReference?.display ??
          'Unknown Medication',
        status,
        start: m.authoredOn?.split('T')[0] ?? '',
        end: m.dispenseRequest?.validityPeriod?.end?.split('T')[0],
        reason:
          m.reasonCode?.[0]?.text ?? m.reasonCode?.[0]?.coding?.[0]?.display,
      };
    });
}

export function mapFHIRObservations(bundle: FHIRBundle): Observation[] {
  return (bundle.entry ?? [])
    .map((e) => e.resource as FHIRObservation)
    .filter(Boolean)
    .map((o) => ({
      id: o.id,
      code: o.code?.coding?.[0]?.code ?? '',
      display: o.code?.coding?.[0]?.display ?? o.code?.text ?? 'Unknown Observation',
      value: o.valueQuantity?.value?.toString() ?? o.valueString ?? '',
      unit: o.valueQuantity?.unit ?? '',
      date: o.effectiveDateTime?.split('T')[0] ?? '',
    }));
}

export function mapFHIRProcedures(bundle: FHIRBundle): Procedure[] {
  return (bundle.entry ?? [])
    .map((e) => e.resource as FHIRProcedure)
    .filter(Boolean)
    .map((p) => {
      const date = p.performedDateTime?.split('T')[0] ?? p.performedPeriod?.start?.split('T')[0] ?? '';
      const endDate = p.performedPeriod?.end?.split('T')[0];
      let durationWeeks: number | undefined;
      if (date && endDate) {
        const days = (new Date(endDate).getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
        if (days > 0) durationWeeks = Math.round(days / 7);
      }
      return {
        id: p.id,
        code: p.code?.coding?.[0]?.code ?? '',
        display: p.code?.coding?.[0]?.display ?? p.code?.text ?? 'Unknown Procedure',
        date,
        outcome: p.outcome?.text ?? p.outcome?.coding?.[0]?.display,
        durationWeeks,
      };
    });
}

export function mapFHIRDocumentReferences(bundle: FHIRBundle): DocumentRef[] {
  return (bundle.entry ?? [])
    .map((e) => e.resource as FHIRDocumentReference)
    .filter(Boolean)
    .map((d) => {
      const attachment = d.content?.[0]?.attachment;
      const contentType = attachment?.contentType ?? '';
      let textContent: string | undefined;
      if (attachment?.data && contentType.startsWith('text/')) {
        try { textContent = atob(attachment.data); } catch { /* ignore decode errors */ }
      }
      return {
        id: d.id,
        type: d.type?.coding?.[0]?.display ?? d.type?.text ?? 'Document',
        date: d.date?.split('T')[0] ?? '',
        status: d.status ?? 'current',
        description: d.description ?? attachment?.title ?? '',
        contentType,
        url: attachment?.url,
        textContent,
      };
    });
}

export function mapFHIRCoverages(bundle: FHIRBundle): Coverage[] {
  return (bundle.entry ?? [])
    .map((e) => e.resource as FHIRCoverage)
    .filter(Boolean)
    .map((c) => ({
      id: c.id,
      status: c.status ?? 'active',
      payer: c.payor?.[0]?.display ?? 'Unknown Payer',
      subscriberId: c.subscriberId,
      relationship: c.relationship?.coding?.[0]?.display,
      period: c.period ? { start: c.period.start?.split('T')[0], end: c.period.end?.split('T')[0] } : undefined,
    }));
}

// LOINC code for BMI
const BMI_LOINC = '39156-5';

export function extractBMI(observations: Observation[]): number {
  const bmiObs = observations.find((o) => o.code === BMI_LOINC);
  if (bmiObs) return parseFloat(bmiObs.value) || 0;
  return 0;
}
