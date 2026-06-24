import { NextResponse } from "next/server";

import { parseQuestionnaire } from "@/lib/questionnaire";
import { createSession } from "@/lib/sessions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "body must be an object" },
      { status: 400 },
    );
  }

  const { questionnaire: rawQuestionnaire, callbackUrl } = body as Record<
    string,
    unknown
  >;

  if (!isHttpUrl(callbackUrl)) {
    return NextResponse.json(
      { error: "callbackUrl must be a valid http(s) URL" },
      { status: 400 },
    );
  }

  let questionnaire;
  try {
    questionnaire = parseQuestionnaire(rawQuestionnaire);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "invalid questionnaire",
      },
      { status: 400 },
    );
  }

  const session = createSession(
    questionnaire,
    callbackUrl,
    new Date().toISOString(),
  );

  const path = `/q/${session.id}`;
  return NextResponse.json(
    {
      id: session.id,
      path,
      url: new URL(path, request.url).toString(),
    },
    { status: 201 },
  );
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
