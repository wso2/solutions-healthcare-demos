import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  // eslint-disable-next-line no-console
  console.log("[demo-callback] received transcript:", JSON.stringify(payload));
  return NextResponse.json({ received: true });
}
