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
