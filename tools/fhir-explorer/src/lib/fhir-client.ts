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

import { recordRequest } from "./request-history";

export const DEFAULT_BASE_URL = "http://localhost:9090/fhir/r4";

const HTTP_SCHEME = /^https?:\/\//i;
// Anything that looks like "<scheme>:" at the very start (e.g. javascript:, data:, file:).
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// Absolute http(s) targets are routed through the Next.js proxy route to avoid CORS.
const FHIR_PROXY_PATH = "/api/fhir";

/** Encode one FHIR path segment so user input can't break out of it ("../", "?query", "#fragment"); normal ids/types are unaffected. */
export function encodeFhirPathSegment(segment: string): string {
  return encodeURIComponent(segment);
}

export interface FhirResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
  raw: string;
  url: string;
  method: string;
  durationMs: number;
}

export async function fhirFetch(
  path: string,
  init: RequestInit = {},
  baseOverride?: string,
): Promise<FhirResponse> {
  const base = (baseOverride ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const isAbsolute = HTTP_SCHEME.test(path);
  // Absolute URLs come from server-supplied Bundle "link" URLs; allow only http(s) so a malicious server can't make us dereference javascript:/data:/file:.
  if (isAbsolute) {
    const u = new URL(path);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error(`Refusing to request non-HTTP(S) URL: ${path}`);
    }
  } else if (ANY_SCHEME.test(path)) {
    throw new Error(`Refusing to request non-HTTP(S) URL: ${path}`);
  }
  const url = isAbsolute ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/fhir+json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/fhir+json");
  }

  const requestUrl = HTTP_SCHEME.test(url)
    ? `${FHIR_PROXY_PATH}?url=${encodeURIComponent(url)}`
    : url;

  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(requestUrl, { ...init, method, headers });
  } catch (e) {
    recordRequest({
      method,
      path: isAbsolute ? path : path.startsWith("/") ? path : `/${path}`,
      status: 0,
    });
    throw e;
  }
  const raw = await res.text();
  const durationMs = Math.round(performance.now() - start);

  let body: unknown = raw;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* not json */
  }

  const respHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => (respHeaders[k] = v));

  recordRequest({
    method,
    path: isAbsolute ? path : path.startsWith("/") ? path : `/${path}`,
    status: res.status,
  });

  return {
    status: res.status,
    ok: res.ok,
    headers: respHeaders,
    body,
    raw,
    url,
    method,
    durationMs,
  };
}
