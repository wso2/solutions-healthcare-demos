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

import type { CallbackPayload } from "@/lib/transcript";
import ky from "ky";

import { NextResponse } from "next/server";

import { notifyDashboard } from "@/lib/dashboard-events";
import { logger } from "@/lib/logger";
import { getSession, SessionStatus } from "@/lib/sessions";
import { submitSchema } from "@/lib/transcript";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const session = getSession(id);
    if (!session) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }
    if (session.status === SessionStatus.Completed) {
      return NextResponse.json(
        { error: "session already completed" },
        { status: 409 },
      );
    }

    const parsed = submitSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "invalid request body" },
        { status: 400 },
      );
    }

    const { messages } = parsed.data;
    const payload: CallbackPayload = {
      sessionId: session.id,
      title: session.questionnaire.title,
      messages,
    };

    const deliveryError = await deliver(session.callbackUrl, payload);

    session.status = SessionStatus.Completed;
    session.completedAt = new Date().toISOString();
    session.messages = messages;
    session.deliveryError = deliveryError;

    const answerCount = messages.filter(
      (message) => message.role === "user",
    ).length;
    notifyDashboard({
      patientId: session.patientId ?? session.id,
      label: "Patient responded via WhatsApp",
      detail: `${answerCount} answer${answerCount === 1 ? "" : "s"} submitted for "${session.questionnaire.title}"`,
      payload: {
        answerCount: String(answerCount),
        sessionId: session.id,
      },
    });

    return NextResponse.json({
      status: session.status,
      delivered: deliveryError === undefined,
      deliveryError,
      payload,
    });
  } catch (error) {
    logger.error("failed to submit session", { id, error });
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 },
    );
  }
}

async function deliver(
  callbackUrl: string,
  payload: CallbackPayload,
): Promise<string | undefined> {
  try {
    const res = await ky.post(callbackUrl, {
      json: payload,
      throwHttpErrors: false,
      timeout: 10_000,
    });
    if (!res.ok) {
      logger.warn("callback delivery returned non-ok", {
        callbackUrl,
        status: res.status,
      });
      return `callback responded ${res.status}`;
    }
    return undefined;
  } catch (error) {
    logger.error("callback delivery failed", { callbackUrl, error });
    return error instanceof Error ? error.message : "callback request failed";
  }
}
