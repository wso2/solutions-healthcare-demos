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

import ky from "ky";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const HEALTHKIT_SIMULATOR_URL =
  process.env.HEALTHKIT_SIMULATOR_URL ?? "http://localhost:8000";

// Forces the healthkit simulator's vitals-forward cron to run immediately instead of waiting for its own schedule, so a demo trigger drives the real vitals -> ML -> agent pipeline (server-side to avoid a browser CORS request to another container/port).
export async function POST() {
  try {
    await ky.post(`${HEALTHKIT_SIMULATOR_URL}/vitals-cron/run-now`, {
      timeout: 30_000,
    });
    return NextResponse.json({ triggered: true });
  } catch (error) {
    logger.error("failed to trigger vitals-cron run-now", { error });
    return NextResponse.json(
      { error: "could not reach the healthkit simulator" },
      { status: 502 },
    );
  }
}
