import process from "node:process";
import ky from "ky";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export const runtime = "nodejs";

interface GenerateResult {
  patientId: string;
  patientName?: string;
  sessionId?: string;
  path?: string;
  error?: string;
}

interface GenerateResponse {
  results: GenerateResult[];
}

export async function POST() {
  const collectorServiceUrl =
    process.env.COLLECTOR_SERVICE_URL ?? "http://localhost:8004";

  try {
    const data = await generate(collectorServiceUrl);
    if (!data) {
      return NextResponse.json(
        { error: "collector service request failed" },
        { status: 502 },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    logger.error("failed to generate questionnaires", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 },
    );
  }
}

async function generate(
  collectorServiceUrl: string,
): Promise<GenerateResponse | undefined> {
  try {
    const res = await ky.post(`${collectorServiceUrl}/generate`, {
      throwHttpErrors: false,
      timeout: 30_000,
    });
    if (!res.ok) {
      logger.warn("collector service returned non-ok", {
        collectorServiceUrl,
        status: res.status,
      });
      return undefined;
    }
    return (await res.json()) as GenerateResponse;
  } catch (error) {
    logger.error("collector service request failed", {
      collectorServiceUrl,
      error,
    });
    return undefined;
  }
}
