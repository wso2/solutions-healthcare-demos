#!/usr/bin/env bun

import { join } from "node:path";
import { seedFhir, EHR_FHIR_SERVER_URL } from "./fhir";
import { seedHealthkit, seedVitalsTimeline, HEALTHKIT_URL } from "./healthkit";
import { log, waitForHealthy } from "./util";
import type { HealthkitPatient, SeedPatient } from "./types";

const SEED_DATA_FILE = process.env.SEED_DATA_FILE ?? join(import.meta.dir, "data/patients.json");
const VITALS_HORIZON_HOURS = Number(process.env.VITALS_HORIZON_HOURS ?? 24);

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

  await seedVitalsTimeline(patients, healthkitPatients, VITALS_HORIZON_HOURS);

  log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
