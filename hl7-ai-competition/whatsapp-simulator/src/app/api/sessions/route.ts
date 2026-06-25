import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { questionnaireSchema } from "@/lib/questionnaire";
import { createSession } from "@/lib/sessions";

export const runtime = "nodejs";

const createBody = z.object({
  questionnaire: questionnaireSchema,
  callbackUrl: z.url().refine(
    (value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "callbackUrl must be a valid http(s) URL" },
  ),
});

export async function POST(request: Request) {
  try {
    const parsed = createBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "invalid request body" },
        { status: 400 },
      );
    }

    const { questionnaire, callbackUrl } = parsed.data;
    const session = createSession(
      questionnaire,
      callbackUrl,
      new Date().toISOString(),
    );

    const path = `/q/${session.id}`;
    return NextResponse.json(
      { id: session.id, path, url: new URL(path, request.url).toString() },
      { status: 201 },
    );
  } catch (error) {
    logger.error("failed to create session", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 },
    );
  }
}
