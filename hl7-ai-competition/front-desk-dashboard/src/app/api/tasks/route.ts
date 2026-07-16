import type { Bundle, Patient as FhirPatient, Task as FhirTask } from "fhir/r4";

import process from "node:process";

import { Client } from "fhir-kit-client";
import { NextResponse } from "next/server";

import { formatPatientName } from "@/lib/fhir-patient";

export const runtime = "nodejs";

export interface EhrTask {
  id: string;
  patientId: string | undefined;
  patientName: string | undefined;
  description: string;
  priority: string | undefined;
  authoredOn: string | undefined;
  status: string;
}

function toEhrTask(task: FhirTask): Omit<EhrTask, "patientName"> {
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
    priority: task.priority,
    authoredOn: task.authoredOn,
    status: task.status,
  };
}

// The task list is patient-centric in the UI, but Task itself only carries a
// reference - resolve each referenced patient's name in one batch so the list
// doesn't have to make its own per-row request.
async function resolvePatientNames(
  client: Client,
  patientIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  await Promise.all(
    Array.from(new Set(patientIds)).map(async (id) => {
      try {
        const patient = (await client.read({
          resourceType: "Patient",
          id,
        })) as unknown as FhirPatient;
        names.set(id, formatPatientName(patient));
      } catch (error) {
        console.error(`failed to fetch patient ${id} from ehr-fhir-server`, error);
      }
    }),
  );
  return names;
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

    const patientNames = await resolvePatientNames(
      client,
      tasks
        .map((task) => task.patientId)
        .filter((id): id is string => id !== undefined),
    );

    return NextResponse.json({
      tasks: tasks.map((task) => ({
        ...task,
        patientName: task.patientId
          ? patientNames.get(task.patientId)
          : undefined,
      })),
    });
  } catch (error) {
    console.error("failed to fetch tasks from ehr-fhir-server", error);
    return NextResponse.json({ tasks: [] });
  }
}
