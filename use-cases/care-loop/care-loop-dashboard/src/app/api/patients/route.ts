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
