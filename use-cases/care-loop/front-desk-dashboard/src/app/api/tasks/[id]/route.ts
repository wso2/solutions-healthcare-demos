import type { Task as FhirTask } from "fhir/r4";

import process from "node:process";

import { Client } from "fhir-kit-client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export interface EhrTaskDetail {
  id: string;
  status: string;
  intent: string | undefined;
  patientId: string | undefined;
  description: string;
  authoredOn: string | undefined;
  lastModified: string | undefined;
  basedOnRiskAssessments: { id: string; display: string | undefined }[];
}

function riskAssessmentId(reference: string | undefined): string | undefined {
  const marker = "/RiskAssessment/";
  const index = reference?.lastIndexOf(marker);
  if (reference === undefined || index === undefined || index === -1) return undefined;
  return reference.slice(index + marker.length);
}

function toEhrTaskDetail(task: FhirTask): EhrTaskDetail {
  const subjectRef = task.for?.reference ?? task.focus?.reference;
  const patientId = subjectRef?.startsWith("Patient/")
    ? subjectRef.slice("Patient/".length)
    : subjectRef;

  const basedOnRiskAssessments = (task.basedOn ?? [])
    .map((ref) => ({ id: riskAssessmentId(ref.reference), display: ref.display }))
    .filter((ref): ref is { id: string; display: string | undefined } => ref.id !== undefined);

  return {
    id: task.id ?? "",
    status: task.status,
    intent: task.intent,
    patientId,
    description:
      task.description ??
      task.note?.map((n) => n.text).join(" ") ??
      "Task requested",
    authoredOn: task.authoredOn,
    lastModified: task.lastModified,
    basedOnRiskAssessments,
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
    const task = (await client.read({
      resourceType: "Task",
      id,
    })) as unknown as FhirTask;

    return NextResponse.json({ task: toEhrTaskDetail(task) });
  } catch (error) {
    console.error(`failed to fetch task ${id} from ehr-fhir-server`, error);
    return NextResponse.json({ task: null }, { status: 404 });
  }
}
