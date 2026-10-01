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

import { linkFhirPatient } from "./healthkit";
import { log } from "./util";
import type { HealthkitPatient, SeedPatient } from "./types";

export const EHR_FHIR_SERVER_URL = process.env.EHR_FHIR_SERVER_URL ?? "http://localhost:9090/fhir/r4";

async function fhirCreate<T extends { id: string }>(resourceType: string, resource: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${EHR_FHIR_SERVER_URL}/${resourceType}`, {
    method: "POST",
    headers: { "content-type": "application/fhir+json" },
    body: JSON.stringify(resource),
  });
  if (!res.ok) {
    throw new Error(`POST ${resourceType} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function seedFhir(seed: SeedPatient, patient: HealthkitPatient): Promise<void> {
  if (patient.fhir_patient_id) {
    log(`ehr-fhir-server already has Patient/${patient.fhir_patient_id} for ${seed.patient.mrn}; skipping.`);
    return;
  }

  const fhirPatient = await fhirCreate<{ id: string }>("Patient", seed.fhir.patient);
  log(`created ehr-fhir-server Patient/${fhirPatient.id}`);
  const subject = { reference: `Patient/${fhirPatient.id}` };

  const encounter = await fhirCreate<{ id: string }>("Encounter", { ...seed.fhir.encounter, subject });
  log(`created ehr-fhir-server Encounter/${encounter.id}`);

  for (const condition of seed.fhir.conditions) {
    const created = await fhirCreate<{ id: string }>("Condition", { ...condition, subject });
    log(`created ehr-fhir-server Condition/${created.id}`);
  }

  for (const allergy of seed.fhir.allergies) {
    const created = await fhirCreate<{ id: string }>("AllergyIntolerance", { ...allergy, patient: subject });
    log(`created ehr-fhir-server AllergyIntolerance/${created.id}`);
  }

  for (const medication of seed.fhir.medications) {
    const created = await fhirCreate<{ id: string }>("MedicationRequest", { ...medication, subject });
    log(`created ehr-fhir-server MedicationRequest/${created.id}`);
  }

  for (const observation of seed.fhir.observations) {
    const created = await fhirCreate<{ id: string }>("Observation", {
      ...observation,
      subject,
      encounter: { reference: `Encounter/${encounter.id}` },
    });
    log(`created ehr-fhir-server Observation/${created.id}`);
  }

  await linkFhirPatient(patient.uuid, fhirPatient.id);
}
