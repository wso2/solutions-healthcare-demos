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

#!/usr/bin/env bun

import { join } from "node:path";
import { seedFhir, EHR_FHIR_SERVER_URL } from "./fhir";
import { seedHealthkit, seedVitalsTimeline, HEALTHKIT_URL } from "./healthkit";
import { log, waitForHealthy } from "./util";
import type { HealthkitPatient, SeedPatient } from "./types";

const SEED_DATA_FILE = process.env.SEED_DATA_FILE ?? join(import.meta.dir, "data/patients.json");
const VITALS_PAST_HOURS = Number(process.env.VITALS_PAST_HOURS ?? 24);
const VITALS_FUTURE_HOURS = Number(process.env.VITALS_FUTURE_HOURS ?? 24);

async function main(): Promise<void> {
  const patients = (await Bun.file(SEED_DATA_FILE).json()) as SeedPatient[];

  await waitForHealthy(`${HEALTHKIT_URL}/health`, "apple-healthkit-simulator");
  await waitForHealthy(`${EHR_FHIR_SERVER_URL}/metadata`, "ehr-fhir-server");

  const healthkitPatients: HealthkitPatient[] = [];
  for (const seed of patients) {
    const patient = await seedHealthkit(seed);
    await seedFhir(seed, patient);
    healthkitPatients.push(patient);
  }

  await seedVitalsTimeline(patients, healthkitPatients, VITALS_PAST_HOURS, VITALS_FUTURE_HOURS);

  log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
