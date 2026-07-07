import type { Bundle, Task as FhirTask } from "fhir/r4";

import process from "node:process";

import { Client } from "fhir-kit-client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export interface EhrTask {
  id: string;
  patientId: string | undefined;
  description: string;
  authoredOn: string | undefined;
  status: string;
}

function toEhrTask(task: FhirTask): EhrTask {
  const subjectRef = task.for?.reference ?? task.focus?.reference;
  const patientId = subjectRef?.startsWith("Patient/")
    ? subjectRef.slice("Patient/".length)
    : subjectRef;

  return {
    id: task.id ?? "",
    patientId,
    description:
      task.description ??
      task.note?.map((n) => n.text).join(" ") ??
      "Task requested",
    authoredOn: task.authoredOn,
    status: task.status,
  };
}

export async function GET(request: Request) {
  const baseUrl =
    process.env.EHR_FHIR_SERVER_URL ?? "http://localhost:9090/fhir/r4";
  const patientId = new URL(request.url).searchParams.get("patientId");

  const searchParams: Record<string, string> = { status: "requested" };
  if (patientId) {
    searchParams.patient = `Patient/${patientId}`;
  }

  try {
    const client = new Client({ baseUrl });
    const bundle = (await client.resourceSearch({
      resourceType: "Task",
      searchParams,
    })) as unknown as Bundle<FhirTask>;

    const tasks = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is FhirTask => resource !== undefined)
      .map(toEhrTask);

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("failed to fetch tasks from ehr-fhir-server", error);
    return NextResponse.json({ tasks: [] });
  }
}
