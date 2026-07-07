import type { Bundle, Patient as FhirPatient } from "fhir/r4";

import process from "node:process";

import { Client } from "fhir-kit-client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export interface EhrPatient {
  id: string;
  name: string;
  birthDate: string | undefined;
  gender: string | undefined;
}

function formatName(patient: FhirPatient): string {
  const name = patient.name?.[0];
  if (!name) return "Unknown patient";
  return [...(name.given ?? []), name.family].filter(Boolean).join(" ");
}

function toEhrPatient(patient: FhirPatient): EhrPatient {
  return {
    id: patient.id ?? "",
    name: formatName(patient),
    birthDate: patient.birthDate,
    gender: patient.gender,
  };
}

export async function GET() {
  const baseUrl =
    process.env.EHR_FHIR_SERVER_URL ?? "http://localhost:9090/fhir/r4";

  try {
    const client = new Client({ baseUrl });
    const bundle = (await client.resourceSearch({
      resourceType: "Patient",
      searchParams: { _count: 200 },
    })) as unknown as Bundle<FhirPatient>;

    const patients = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is FhirPatient => resource !== undefined)
      .map(toEhrPatient);

    return NextResponse.json({ patients });
  } catch (error) {
    console.error("failed to fetch patients from ehr-fhir-server", error);
    return NextResponse.json({ patients: [] });
  }
}
