#!/usr/bin/env bun

import { CARE_LOOP_FHIR_SERVER_URL, EHR_FHIR_SERVER_URL, syncAll } from "./fhir";
import { log, waitForHealthy } from "./util";

const SYNC_INTERVAL_SECONDS = Number(process.env.SYNC_INTERVAL_SECONDS ?? 3600);

async function runOnce(): Promise<void> {
  await waitForHealthy(`${EHR_FHIR_SERVER_URL}/metadata`, "ehr-fhir-server");
  await waitForHealthy(`${CARE_LOOP_FHIR_SERVER_URL}/metadata`, "care-loop-fhir-server");
  await syncAll();
  log("sync complete.");
}

async function main(): Promise<void> {
  for (;;) {
    try {
      await runOnce();
    } catch (err) {
      console.error(err);
    }
    await Bun.sleep(SYNC_INTERVAL_SECONDS * 1000);
  }
}

main();
