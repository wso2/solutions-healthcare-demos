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
import { z } from "zod";

import { logger } from "@/lib/logger";
import { sampleQuestionnaire } from "@/lib/sample";

export const runtime = "nodejs";

const turnBody = z.object({
  sessionId: z.string().trim().min(1),
  text: z.string(),
  time: z.string().optional(),
});

// Stand-in for the collector's /turns agent so the Launch live demo button can drive the sample questionnaire turn-by-turn with no external services. Tracks, per session, how many of the sample questions have been asked (the first was seeded at session create) and serves the next one.
const asked = new Map<string, number>();

export async function POST(request: Request) {
  const parsed = turnBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid turn request" },
      { status: 400 },
    );
  }

  const { sessionId } = parsed.data;
  const questions = sampleQuestionnaire.questions;
  // The opening question was already asked when the session was created, so start at 1.
  const answered = asked.get(sessionId) ?? 1;

  if (answered >= questions.length) {
    asked.delete(sessionId);
    return NextResponse.json({
      done: true,
      botMessages: [
        {
          text: "Thank you. Your care team will review your answers and be in touch.",
        },
      ],
    });
  }

  const next = questions[answered];
  asked.set(sessionId, answered + 1);
  logger.info("demo turn", { sessionId, question: next.id });
  return NextResponse.json({
    done: false,
    botMessages: [{ text: next.text, questionId: next.id }],
  });
}
