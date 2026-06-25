import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  logger.info("demo-callback received transcript", payload);
  return NextResponse.json({ received: true });
}
