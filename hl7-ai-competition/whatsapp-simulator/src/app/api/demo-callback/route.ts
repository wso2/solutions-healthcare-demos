import { NextResponse } from "next/server";

const globalForCallback = globalThis as unknown as {
  __whatsappSimulatorLastCallback?: unknown;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  globalForCallback.__whatsappSimulatorLastCallback = await request
    .json()
    .catch(() => null);
  return NextResponse.json({ received: true });
}

export async function GET() {
  return NextResponse.json({
    lastCallback: globalForCallback.__whatsappSimulatorLastCallback ?? null,
  });
}
