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
