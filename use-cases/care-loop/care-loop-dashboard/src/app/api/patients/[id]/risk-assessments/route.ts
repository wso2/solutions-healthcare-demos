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

import type { RiskAssessment } from "fhir/r4";

import { NextResponse } from "next/server";

import { degradedResponse } from "@/lib/api-degraded";
import { careLoopClient, searchResources } from "@/lib/fhir";

export const runtime = "nodejs";

export interface RiskAssessmentPredictionSummary {
  probability: number | null;
  qualitativeRisk: string | null;
}

export interface RiskAssessmentSummary {
  id: string;
  method: string | null;
  note: string | null;
  occurrenceDateTime: string | null;
  predictions: RiskAssessmentPredictionSummary[];
  basis: string[];
  raw: RiskAssessment;
}

function toRiskAssessmentSummary(
  assessment: RiskAssessment,
): RiskAssessmentSummary {
  const note =
    assessment.note && assessment.note.length > 0
      ? assessment.note
          .map((annotation) => annotation.text)
          .filter(Boolean)
          .join(" ")
      : null;

  const predictions = (assessment.prediction ?? []).map((prediction) => ({
    probability: prediction.probabilityDecimal ?? null,
    qualitativeRisk: prediction.qualitativeRisk?.coding?.[0]?.code ?? null,
  }));

  const basis = (assessment.basis ?? [])
    .map((reference) => reference.reference)
    .filter((reference): reference is string => Boolean(reference));

  return {
    id: assessment.id ?? "",
    method: assessment.method?.text ?? null,
    note,
    occurrenceDateTime: assessment.occurrenceDateTime ?? assessment.meta?.lastUpdated ?? null,
    predictions,
    basis,
    raw: assessment,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const riskAssessments = (
      await searchResources<RiskAssessment>(careLoopClient(), "RiskAssessment", {
        subject: `Patient/${id}`,
        _sort: "-_lastUpdated",
        _count: 50,
      })
    ).map(toRiskAssessmentSummary);

    return NextResponse.json({ riskAssessments });
  } catch (error) {
    console.error(
      "failed to fetch risk assessments from care-loop-fhir-server",
      error,
    );
    return degradedResponse({ riskAssessments: [] });
  }
}
