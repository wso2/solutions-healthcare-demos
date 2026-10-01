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

import type { Patient as FhirPatient, Observation, RiskAssessment, Task } from "fhir/r4";

import { NextResponse } from "next/server";

import { degradedResponse } from "@/lib/api-degraded";
import { listEvents, listRecentEvents } from "@/lib/db";
import { careLoopClient, ehrClient, formatPatientName, searchResources } from "@/lib/fhir";
import { HEART_RATE_LOINC } from "@/lib/vitals";

export const runtime = "nodejs";

const CLOSED_STATUSES = new Set(["completed", "cancelled", "entered-in-error"]);
const ML_METHOD_MARKER = "heart-risk-service";
const AGENTIC_METHOD_MARKER = "ai-service";

export interface HomePatientRow {
  id: string;
  name: string;
  latestHr: number | null;
  mlRisk: number | null;
  agenticRisk: number | null;
  openTasks: number;
  lastActivity: string | null;
}

export interface HomeSummary {
  totalPatients: number;
  openTasks: number;
  escalationsToday: number;
  avgMlRisk: number | null;
  latestEvent: string | null;
  patients: HomePatientRow[];
  error?: boolean;
}

function isToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
}

const EMPTY_SUMMARY: HomeSummary = {
  totalPatients: 0,
  openTasks: 0,
  escalationsToday: 0,
  avgMlRisk: null,
  latestEvent: null,
  patients: [],
};

export async function GET() {
  try {
    const careLoop = careLoopClient();
    const ehr = ehrClient();

    const patients = await searchResources<FhirPatient>(careLoop, "Patient", { _count: 200 });

    const rows = await Promise.all(
      patients.map(async (patient) => {
        const id = patient.id ?? "";

        const [tasks, riskAssessments, observations] = await Promise.all([
          searchResources<Task>(ehr, "Task", { patient: `Patient/${id}`, _sort: "-_lastUpdated", _count: 50 }),
          searchResources<RiskAssessment>(careLoop, "RiskAssessment", {
            subject: `Patient/${id}`,
            _sort: "-_lastUpdated",
            _count: 50,
          }),
          searchResources<Observation>(careLoop, "Observation", {
            subject: `Patient/${id}`,
            _sort: "-date",
            _count: 50,
          }),
        ]);

        const openTasks = tasks.filter((task) => !CLOSED_STATUSES.has(task.status.toLowerCase())).length;
        const escalationsToday = tasks.filter((task) => isToday(task.authoredOn ?? task.meta?.lastUpdated)).length;

        const mlAssessment = riskAssessments.find((assessment) =>
          assessment.method?.text?.toLowerCase().includes(ML_METHOD_MARKER),
        );
        const mlRisk = mlAssessment?.prediction?.[0]?.probabilityDecimal ?? null;
        const agenticAssessment = riskAssessments.find((assessment) =>
          assessment.method?.text?.toLowerCase().includes(AGENTIC_METHOD_MARKER),
        );
        const agenticRisk = agenticAssessment?.prediction?.[0]?.probabilityDecimal ?? null;

        const hrObservation = observations.find(
          (observation) => observation.code.coding?.[0]?.code === HEART_RATE_LOINC,
        );
        const latestHr = hrObservation?.valueQuantity?.value ?? null;

        const lastActivity = listEvents(id, 1)[0]?.receivedAt ?? null;

        return {
          id,
          name: formatPatientName(patient),
          latestHr,
          mlRisk,
          agenticRisk,
          openTasks,
          escalationsToday,
          lastActivity,
        };
      }),
    );

    const totalPatients = rows.length;
    const openTasksTotal = rows.reduce((sum, row) => sum + row.openTasks, 0);
    const escalationsToday = rows.reduce((sum, row) => sum + row.escalationsToday, 0);
    const mlRisks = rows.map((row) => row.mlRisk).filter((value): value is number => value !== null);
    const avgMlRisk = mlRisks.length > 0 ? mlRisks.reduce((sum, value) => sum + value, 0) / mlRisks.length : null;
    const latestEvent = listRecentEvents(1)[0]?.receivedAt ?? null;

    const summary: HomeSummary = {
      totalPatients,
      openTasks: openTasksTotal,
      escalationsToday,
      avgMlRisk,
      latestEvent,
      patients: rows.map(({ escalationsToday: _escalationsToday, ...row }) => row),
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error("failed to compute home summary", error);
    return degradedResponse(EMPTY_SUMMARY);
  }
}
