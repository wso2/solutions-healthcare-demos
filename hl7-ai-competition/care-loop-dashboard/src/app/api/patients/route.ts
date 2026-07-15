import type { Patient as FhirPatient } from "fhir/r4";

import { NextResponse } from "next/server";

import { degradedResponse } from "@/lib/api-degraded";
import { careLoopClient, formatPatientName, searchResources } from "@/lib/fhir";

export const runtime = "nodejs";

export interface OpsPatient {
  id: string;
  name: string;
  birthDate: string | undefined;
  gender: string | undefined;
  raw: FhirPatient;
}

function toOpsPatient(patient: FhirPatient): OpsPatient {
  return {
    id: patient.id ?? "",
    name: formatPatientName(patient),
    birthDate: patient.birthDate,
    gender: patient.gender,
    raw: patient,
  };
}

export async function GET() {
  try {
    const patients = (
      await searchResources<FhirPatient>(careLoopClient(), "Patient", {
        _count: 200,
      })
    ).map(toOpsPatient);

    return NextResponse.json({ patients });
  } catch (error) {
    console.error("failed to fetch patients from care-loop-fhir-server", error);
    return degradedResponse({ patients: [] });
  }
}
