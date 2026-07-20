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
