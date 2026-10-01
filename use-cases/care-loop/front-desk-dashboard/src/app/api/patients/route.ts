// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import type { Bundle, Patient as FhirPatient } from "fhir/r4";

import process from "node:process";

import { Client } from "fhir-kit-client";
import { NextResponse } from "next/server";

import { formatPatientName } from "@/lib/fhir-patient";

export const runtime = "nodejs";

export interface EhrPatient {
  id: string;
  name: string;
  birthDate: string | undefined;
  gender: string | undefined;
}

function toEhrPatient(patient: FhirPatient): EhrPatient {
  return {
    id: patient.id ?? "",
    name: formatPatientName(patient),
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
