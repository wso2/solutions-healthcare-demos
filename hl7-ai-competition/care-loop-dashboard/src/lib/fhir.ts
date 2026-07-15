import type { Bundle, Patient as FhirPatient, FhirResource } from "fhir/r4";

import process from "node:process";

import { Client } from "fhir-kit-client";

// Two FHIR servers back the dashboard: the internal care-loop store (live loop data) and the EHR (tasks + patient history).
export function careLoopClient(): Client {
  return new Client({
    baseUrl: process.env.CARE_LOOP_FHIR_SERVER_URL ?? "http://localhost:9091/fhir",
  });
}

export function ehrClient(): Client {
  return new Client({
    baseUrl: process.env.EHR_FHIR_SERVER_URL ?? "http://localhost:9090/fhir/r4",
  });
}

// fhir-kit-client types resourceSearch as returning OperationOutcome, hence the cast; unwraps the bundle to the plain resources every route maps over.
export async function searchResources<T extends FhirResource>(
  client: Client,
  resourceType: T["resourceType"],
  searchParams: Record<string, string | number>,
): Promise<T[]> {
  const bundle = (await client.resourceSearch({
    resourceType,
    searchParams,
  })) as unknown as Bundle<T>;

  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is T => resource !== undefined);
}

export function formatPatientName(patient: FhirPatient): string {
  const name = patient.name?.[0];
  if (!name) return "Unknown patient";
  return [...(name.given ?? []), name.family].filter(Boolean).join(" ");
}
