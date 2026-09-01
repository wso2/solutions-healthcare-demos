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

import { resolveFhirTarget } from "@/lib/server/fhir-target";
import { applyTenantToFhirUrl, tenantIdFromRequest } from "@/lib/server/tenant";

export const runtime = "nodejs";

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const REQUEST_HEADERS_TO_REMOVE = [
  "accept-encoding",
  "connection",
  "content-length",
  "cookie",
  "forwarded",
  "host",
  "origin",
  "referer",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
  "x-client-fingerprint",
];
const RESPONSE_HEADERS_TO_REMOVE = [
  "connection",
  "content-encoding",
  "content-length",
  "set-cookie",
  "set-cookie2",
  "transfer-encoding",
];

function forwardedRequestHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  for (const header of REQUEST_HEADERS_TO_REMOVE) headers.delete(header);

  for (const header of headers.keys()) {
    if (header.startsWith("sec-")) headers.delete(header);
  }

  return headers;
}

function forwardedResponseHeaders(response: Response): Headers {
  const headers = new Headers(response.headers);
  for (const header of RESPONSE_HEADERS_TO_REMOVE) headers.delete(header);
  return headers;
}

const MAX_REDIRECTS = 3;

/**
 * Follows redirects manually so every hop goes back through the SSRF guard —
 * with `redirect: "follow"` an allowlisted host could bounce the request to an
 * internal address. Authorization is dropped when a redirect crosses origins.
 */
async function fetchWithValidatedRedirects(
  targetUrl: string,
  init: { method: string; headers: Headers; body?: ArrayBuffer; signal: AbortSignal },
  tenantId: string | null,
): Promise<Response> {
  let url = targetUrl;
  const headers = new Headers(init.headers);

  for (let hop = 0; ; hop++) {
    const response = await fetch(url, { ...init, headers, redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;
    if (hop >= MAX_REDIRECTS) throw new Error("Too many redirects from the FHIR server.");

    const next = applyTenantToFhirUrl(
      await resolveFhirTarget(new URL(location, url).toString()),
      tenantId,
    );
    if (new URL(next).origin !== new URL(url).origin) headers.delete("authorization");
    url = next;
  }
}

async function proxyFhirRequest(request: Request): Promise<Response> {
  const requestedUrl = new URL(request.url).searchParams.get("url");

  const tenantId = tenantIdFromRequest(request);

  let targetUrl: string;
  try {
    targetUrl = applyTenantToFhirUrl(await resolveFhirTarget(requestedUrl), tenantId);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid FHIR URL." },
      { status: 400 },
    );
  }

  try {
    const body = BODYLESS_METHODS.has(request.method) ? undefined : await request.arrayBuffer();
    const response = await fetchWithValidatedRedirects(
      targetUrl,
      {
        method: request.method,
        headers: forwardedRequestHeaders(request),
        body,
        signal: request.signal,
      },
      tenantId,
    );

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: forwardedResponseHeaders(response),
    });
  } catch (error) {
    console.error("FHIR proxy request failed:", error instanceof Error ? error.message : error);
    return Response.json(
      { error: "Could not connect to the selected FHIR server." },
      { status: 502 },
    );
  }
}

export const GET = proxyFhirRequest;
export const POST = proxyFhirRequest;
export const PUT = proxyFhirRequest;
export const PATCH = proxyFhirRequest;
export const DELETE = proxyFhirRequest;
export const HEAD = proxyFhirRequest;
