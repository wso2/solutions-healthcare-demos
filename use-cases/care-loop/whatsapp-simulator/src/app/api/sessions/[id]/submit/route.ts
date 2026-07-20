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
