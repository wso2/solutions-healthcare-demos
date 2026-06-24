import type { CallbackPayload } from "@/lib/transcript";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/sessions";
import { parseTranscript } from "@/lib/transcript";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  let messages;
  try {
    messages = parseTranscript((body as Record<string, unknown>)?.messages);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid transcript" },
      { status: 400 },
    );
  }

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
    const res = await fetch(callbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return `callback responded ${res.status}`;
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "callback request failed";
  }
}
