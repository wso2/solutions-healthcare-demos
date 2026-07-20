import ky, { HTTPError } from "ky";

import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { getSession, SessionStatus } from "@/lib/sessions";

export const runtime = "nodejs";

const messageBody = z.object({
  text: z.string().trim().min(1),
});

interface TurnResult {
  done: boolean;
  botMessages: Array<{ text: string; questionId?: string }>;
}

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
    if (session.mode !== "live" || !session.turnUrl) {
      return NextResponse.json(
        { error: "session is not live" },
        { status: 400 },
      );
    }

    const parsed = messageBody.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "invalid request body" },
        { status: 400 },
      );
    }

    const { text } = parsed.data;
    const result = await takeTurn(session.turnUrl, {
      sessionId: session.id,
      text,
      time: new Date().toISOString(),
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("failed to advance live turn", { id, error });
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 },
    );
  }
}

async function takeTurn(
  turnUrl: string,
  payload: { sessionId: string; text: string; time: string },
): Promise<TurnResult> {
  try {
    const res = await ky.post(turnUrl, {
      json: payload,
      timeout: 30_000,
    });
    return (await res.json()) as TurnResult;
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 410) {
      return {
        done: true,
        botMessages: [
          { text: "This check-in has already been completed. Thank you." },
        ],
      };
    }
    logger.error("live turn request failed", { turnUrl, error });
    return {
      done: false,
      botMessages: [
        { text: "Sorry, something went wrong. Please try again in a moment." },
      ],
    };
  }
}
