import { NextResponse } from "next/server";

// When a FHIR fetch fails, report degraded data instead of pretending an empty result is authoritative. HTTP 200 + error flag keeps the client polling loops simple; every route uses this same shape.
export function degradedResponse<T extends object>(empty: T): NextResponse {
  return NextResponse.json({ ...empty, error: true });
}
