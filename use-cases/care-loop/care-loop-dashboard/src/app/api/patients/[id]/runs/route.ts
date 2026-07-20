import { NextResponse } from "next/server";

import { listEvents } from "@/lib/db";
import { segmentRuns } from "@/lib/runs";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return NextResponse.json({ runs: segmentRuns(listEvents(id)) });
}
