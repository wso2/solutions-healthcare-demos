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

import process from "node:process";

import { Client } from "fhir-kit-client";
import { NextResponse } from "next/server";

import {
  formatPatientAddress,
  formatPatientEmail,
  formatPatientName,
  formatPatientPhone,
} from "@/lib/fhir-patient";

export const runtime = "nodejs";

export interface EhrPatientDetail {
  id: string;
  name: string;
  birthDate: string | undefined;
  gender: string | undefined;
  phone: string | undefined;
  email: string | undefined;
  address: string | undefined;
}

function toEhrPatientDetail(patient: FhirPatient): EhrPatientDetail {
  return {
    id: patient.id ?? "",
    name: formatPatientName(patient),
    birthDate: patient.birthDate,
    gender: patient.gender,
    phone: formatPatientPhone(patient),
    email: formatPatientEmail(patient),
    address: formatPatientAddress(patient),
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
