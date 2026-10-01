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

import type { Observation } from "fhir/r4";

import { NextResponse } from "next/server";

import { degradedResponse } from "@/lib/api-degraded";
import { careLoopClient, searchResources } from "@/lib/fhir";

export const runtime = "nodejs";

export interface ObservationSummary {
  id: string;
  code: string;
  value: string | null;
  unit: string | null;
  effectiveDateTime: string | null;
  raw: Observation;
}

function toObservationSummary(observation: Observation): ObservationSummary {
  const code =
    observation.code.coding?.[0]?.display ?? observation.code.text ?? "";
  const quantity = observation.valueQuantity;

  return {
    id: observation.id ?? "",
    code,
    value: quantity?.value !== undefined ? String(quantity.value) : null,
    unit: quantity?.unit ?? null,
    effectiveDateTime: observation.effectiveDateTime ?? null,
    raw: observation,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const observations = (
      await searchResources<Observation>(careLoopClient(), "Observation", {
        subject: `Patient/${id}`,
        _sort: "-date",
        _count: 100,
      })
    ).map(toObservationSummary);

    return NextResponse.json({ observations });
  } catch (error) {
    console.error(
      "failed to fetch observations from care-loop-fhir-server",
      error,
    );
    return degradedResponse({ observations: [] });
  }
}
