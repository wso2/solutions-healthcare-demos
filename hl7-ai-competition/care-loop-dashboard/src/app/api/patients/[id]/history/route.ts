import type {
  AllergyIntolerance,
  Condition,
  Encounter,
  MedicationRequest,
  Observation,
} from "fhir/r4";

import { NextResponse } from "next/server";

import { degradedResponse } from "@/lib/api-degraded";
import { ehrClient, searchResources } from "@/lib/fhir";

export const runtime = "nodejs";

export interface ConditionSummary {
  id: string;
  code: string;
  onsetDateTime: string | null;
  raw: Condition;
}

export interface MedicationSummary {
  id: string;
  medication: string;
  status: string | null;
  raw: MedicationRequest;
}

export interface AllergySummary {
  id: string;
  substance: string;
  reaction: string | null;
  raw: AllergyIntolerance;
}

export interface EncounterSummary {
  id: string;
  name: string;
  sub: string | null;
  raw: Encounter;
}

export interface BaselineObservationSummary {
  id: string;
  name: string;
  value: string | null;
  effectiveDateTime: string | null;
  raw: Observation;
}

function toConditionSummary(condition: Condition): ConditionSummary {
  const code =
    condition.code?.coding?.[0]?.display ?? condition.code?.text ?? "";

  return {
    id: condition.id ?? "",
    code,
    onsetDateTime: condition.onsetDateTime ?? null,
    raw: condition,
  };
}

function toMedicationSummary(request: MedicationRequest): MedicationSummary {
  const medication =
    request.medicationCodeableConcept?.coding?.[0]?.display ??
    request.medicationCodeableConcept?.text ??
    request.medicationReference?.display ??
    "";

  return {
    id: request.id ?? "",
    medication,
    status: request.status ?? null,
    raw: request,
  };
}

function toAllergySummary(allergy: AllergyIntolerance): AllergySummary {
  const substance =
    allergy.code?.coding?.[0]?.display ?? allergy.code?.text ?? "";
  const reaction =
    allergy.reaction?.[0]?.manifestation?.[0]?.coding?.[0]?.display ?? null;

  return {
    id: allergy.id ?? "",
    substance,
    reaction,
    raw: allergy,
  };
}

// Seeded EHR encounters carry the visit description in reasonCode.text (they have no type).
function toEncounterSummary(encounter: Encounter): EncounterSummary {
  const name =
    encounter.type?.[0]?.text ?? encounter.reasonCode?.[0]?.text ?? "—";
  const sub =
    [encounter.class?.display ?? encounter.class?.code, encounter.status]
      .filter(Boolean)
      .join(" · ") || null;

  return { id: encounter.id ?? "", name, sub, raw: encounter };
}

function formatObservationValue(observation: Observation): string | null {
  const quantity = observation.valueQuantity;
  if (quantity?.value !== undefined) {
    return [String(quantity.value), quantity.unit].filter(Boolean).join(" ");
  }

  const components = observation.component ?? [];
  const systolic = components.find((component) =>
    component.code.coding?.some((coding) => coding.code === "8480-6"),
  )?.valueQuantity;
  const diastolic = components.find((component) =>
    component.code.coding?.some((coding) => coding.code === "8462-4"),
  )?.valueQuantity;
  if (systolic?.value !== undefined && diastolic?.value !== undefined) {
    return [`${systolic.value}/${diastolic.value}`, systolic.unit]
      .filter(Boolean)
      .join(" ");
  }

  return null;
}

function toBaselineObservationSummary(
  observation: Observation,
): BaselineObservationSummary {
  return {
    id: observation.id ?? "",
    name: observation.code.coding?.[0]?.display ?? observation.code.text ?? "—",
    value: formatObservationValue(observation),
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
    const client = ehrClient();
    const patientParams = { patient: `Patient/${id}`, _count: 50 };

    const [conditions, medications, allergies, encounters, baselineObservations] = await Promise.all([
      searchResources<Condition>(client, "Condition", patientParams).then((resources) =>
        resources.map(toConditionSummary),
      ),
      searchResources<MedicationRequest>(client, "MedicationRequest", patientParams).then((resources) =>
        resources.map(toMedicationSummary),
      ),
      searchResources<AllergyIntolerance>(client, "AllergyIntolerance", patientParams).then((resources) =>
        resources.map(toAllergySummary),
      ),
      searchResources<Encounter>(client, "Encounter", patientParams).then((resources) =>
        resources.map(toEncounterSummary),
      ),
      // The EHR server holds only intake baselines (category vital-signs); live loop vitals live on care-loop-fhir-server.
      searchResources<Observation>(client, "Observation", { ...patientParams, category: "vital-signs" }).then(
        (resources) => resources.map(toBaselineObservationSummary),
      ),
    ]);

    return NextResponse.json({
      conditions,
      medications,
      allergies,
      encounters,
      baselineObservations,
    });
  } catch (error) {
    console.error("failed to fetch patient history from ehr-fhir-server", error);
    return degradedResponse({
      conditions: [],
      medications: [],
      allergies: [],
      encounters: [],
      baselineObservations: [],
    });
  }
}
