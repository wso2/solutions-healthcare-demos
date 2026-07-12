import { apiFetch } from './bff';
import {
  mapFHIRPatientBase,
  mapFHIRMedications,
  mapFHIRObservations,
  mapFHIRProcedures,
  mapFHIRDocumentReferences,
  extractBMI,
} from './fhirMappers';
import type { Patient } from '../data/types';

export type PatientBase = Omit<Patient, 'conditions' | 'medications' | 'procedures' | 'observations' | 'notes' | 'documents' | 'coverages'>;

export interface PatientListItem {
  id: string;
  name: string;
}

/** Fetch the list of patients from /v1/patients (returns map of id → name). */
export async function fetchPatientList(): Promise<PatientListItem[]> {
  const map = await apiFetch<Record<string, string>>('/patients');
  return Object.entries(map).map(([id, name]) => ({ id, name }));
}

/** Fetch a lightweight patient summary (demographics only) via FHIR _summary=true. */
export async function fetchPatientSummary(id: string): Promise<PatientBase> {
  const fhirPatient = await apiFetch<Record<string, unknown>>('/patientSummary', { id });
  return mapFHIRPatientBase(fhirPatient as unknown as Parameters<typeof mapFHIRPatientBase>[0]);
}

/** Fetch a single FHIR resource bundle for a patient. Returns empty bundle on error. */
async function fetchResourceBundle(
  id: string,
  resourceType: string,
): Promise<{ entry?: Array<{ resource?: unknown }> }> {
  try {
    return await apiFetch<{ entry?: Array<{ resource?: unknown }> }>('/patientResources', { id, resourceType });
  } catch {
    return {};
  }
}

/**
 * Fetch full patient data by ID.
 * Fans out one request per resource type in parallel.
 */
export async function fetchPatient(id: string): Promise<Patient> {
  const [fhirPatient, observationBundle, medicationBundle, procedureBundle, documentBundle] = await Promise.all([
    apiFetch<Record<string, unknown>>('/patientById', { id }),
    fetchResourceBundle(id, 'Observation'),
    fetchResourceBundle(id, 'MedicationRequest'),
    fetchResourceBundle(id, 'Procedure'),
    fetchResourceBundle(id, 'DocumentReference'),
  ]);

  const base = mapFHIRPatientBase(fhirPatient as unknown as Parameters<typeof mapFHIRPatientBase>[0]);
  const observations = mapFHIRObservations(observationBundle);
  const medications = mapFHIRMedications(medicationBundle);
  const procedures = mapFHIRProcedures(procedureBundle);
  const documents = mapFHIRDocumentReferences(documentBundle);

  return {
    ...base,
    bmi: extractBMI(observations),
    conditions: [],
    medications,
    procedures,
    observations,
    notes: [],
    documents,
    coverages: [],
  };
}

/** Fetch a single resource type, returning both mapped UI data and the raw FHIR bundle. */

export async function fetchPatientDocuments(id: string) {
  const bundle = await fetchResourceBundle(id, 'DocumentReference');
  return { mapped: mapFHIRDocumentReferences(bundle), raw: bundle };
}

export async function fetchPatientMedications(id: string) {
  const bundle = await fetchResourceBundle(id, 'MedicationRequest');
  return { mapped: mapFHIRMedications(bundle), raw: bundle };
}

export async function fetchPatientProcedures(id: string) {
  const bundle = await fetchResourceBundle(id, 'Procedure');
  return { mapped: mapFHIRProcedures(bundle), raw: bundle };
}

export async function fetchPatientObservations(id: string) {
  const bundle = await fetchResourceBundle(id, 'Observation');
  const mapped = mapFHIRObservations(bundle);
  return { mapped, raw: bundle, bmi: extractBMI(mapped) };
}
