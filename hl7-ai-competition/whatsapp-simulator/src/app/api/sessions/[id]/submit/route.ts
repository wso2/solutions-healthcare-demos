import type { CallbackPayload } from "@/lib/transcript";
import ky from "ky";

import { NextResponse } from "next/server";

import { getSession } from "@/lib/sessions";
import { submitSchema } from "@/lib/transcript";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = getSession(id);

  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (session.status === "completed") {
    return NextResponse.json(
      { error: "session already completed" },
      { status: 409 },
    );
  }

  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
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

  session.status = "completed";
  session.completedAt = new Date().toISOString();
  session.messages = messages;
  session.deliveryError = deliveryError;

  return NextResponse.json({
    status: session.status,
    delivered: deliveryError === undefined,
    deliveryError,
    payload,
  });
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
    return res.ok ? undefined : `callback responded ${res.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : "callback request failed";
  }
}
