import type { Patient as FhirPatient } from "fhir/r4";

import process from "node:process";

import { Client } from "fhir-kit-client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export interface EhrPatientDetail {
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

function toEhrPatientDetail(patient: FhirPatient): EhrPatientDetail {
  return {
    id: patient.id ?? "",
    name: formatName(patient),
    birthDate: patient.birthDate,
    gender: patient.gender,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const baseUrl =
    process.env.EHR_FHIR_SERVER_URL ?? "http://localhost:9090/fhir/r4";

  try {
    const client = new Client({ baseUrl });
    const patient = (await client.read({
      resourceType: "Patient",
      id,
    })) as unknown as FhirPatient;

    return NextResponse.json({ patient: toEhrPatientDetail(patient) });
  } catch (error) {
    console.error(`failed to fetch patient ${id} from ehr-fhir-server`, error);
    return NextResponse.json({ patient: null }, { status: 404 });
  }
}
