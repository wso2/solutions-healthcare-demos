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

import type { RiskAssessment as FhirRiskAssessment } from "fhir/r4";

import process from "node:process";

import { Client } from "fhir-kit-client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export interface EhrRiskAssessment {
  id: string;
  method: string | undefined;
  note: string | undefined;
  predictions: { probability: number | undefined; rationale: string | undefined }[];
}

function toEhrRiskAssessment(riskAssessment: FhirRiskAssessment): EhrRiskAssessment {
  return {
    id: riskAssessment.id ?? "",
    method: riskAssessment.method?.text,
    note: riskAssessment.note?.map((n) => n.text).join(" "),
    predictions: (riskAssessment.prediction ?? []).map((p) => ({
      probability: p.probabilityDecimal,
      rationale: p.rationale,
    })),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const baseUrl =
    process.env.CARE_LOOP_FHIR_SERVER_URL ?? "http://localhost:9091/fhir/r4";

  try {
    const client = new Client({ baseUrl });
    const riskAssessment = (await client.read({
      resourceType: "RiskAssessment",
      id,
    })) as unknown as FhirRiskAssessment;

    return NextResponse.json({ riskAssessment: toEhrRiskAssessment(riskAssessment) });
  } catch (error) {
    console.error(`failed to fetch RiskAssessment ${id} from care-loop-fhir-server`, error);
    return NextResponse.json({ riskAssessment: null }, { status: 404 });
  }
}
