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

import { NextResponse } from "next/server";

import { insertEvent } from "@/lib/db";

export const runtime = "nodejs";

interface CreateEventBody {
  patientId?: unknown;
  label?: unknown;
  detail?: unknown;
  payload?: unknown;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === "string");
}

// Fixed contract other services POST to: {patientId, label, detail?, payload?} - fire-and-forget, no auth, insert and return fast (see README.md for details).
export async function POST(request: Request) {
  let body: CreateEventBody;
  try {
    body = (await request.json()) as CreateEventBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { patientId, label, detail, payload } = body;

  if (typeof patientId !== "string" || patientId.trim() === "") {
    return NextResponse.json(
      { error: "patientId must be a non-empty string" },
      { status: 400 },
    );
  }
  // Any non-empty string is accepted on purpose - known labels are typed via StageLabel (lib/stages.ts) but the ingestion contract stays permissive so new services can post before this app knows their labels.
  if (typeof label !== "string" || label.trim() === "") {
    return NextResponse.json(
      { error: "label must be a non-empty string" },
      { status: 400 },
    );
  }
  if (detail !== undefined && typeof detail !== "string") {
    return NextResponse.json(
      { error: "detail must be a string when present" },
      { status: 400 },
    );
  }
  if (payload !== undefined && !isStringRecord(payload)) {
    return NextResponse.json(
      { error: "payload must be a flat object of strings when present" },
      { status: 400 },
    );
  }

  insertEvent(patientId, label, detail, payload as Record<string, string> | undefined);
  return NextResponse.json({ ok: true }, { status: 202 });
}
