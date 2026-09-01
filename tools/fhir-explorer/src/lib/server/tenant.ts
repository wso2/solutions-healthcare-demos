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

import { createHmac, randomBytes } from "node:crypto";
import { isAllowedOrigin } from "@/lib/server/fhir-target";

/**
 * Per-user FHIR tenancy. The nginx-stamped X-Client-Fingerprint is HMAC'd
 * (raw IP + User-Agent would leak into URLs and break the tenant-id charset)
 * and allowlisted-origin requests are rewritten to the wso2/fhir-server's
 * /t/{tenant} prefix, which isolates tenants via Postgres row-level security.
 * External user-supplied FHIR servers keep their URL untouched.
 */

const TENANT_ID_LENGTH = 24;
const FINGERPRINT_HEADER = "x-client-fingerprint";

// HMAC secret so ids can't be computed offline; set TENANT_ID_SECRET for stability
// across restarts, else a random per-process key.
const TENANT_ID_SECRET = process.env.TENANT_ID_SECRET?.trim() || randomBytes(32).toString("hex");

export function tenantIdFromRequest(request: Request): string | null {
  const fingerprint = request.headers.get(FINGERPRINT_HEADER)?.trim();
  if (!fingerprint) return null;
  return createHmac("sha256", TENANT_ID_SECRET)
    .update(fingerprint)
    .digest("hex")
    .slice(0, TENANT_ID_LENGTH);
}

export function applyTenantToFhirUrl(targetUrl: string, tenantId: string | null): string {
  if (!tenantId) return targetUrl;

  const url = new URL(targetUrl);
  if (!isAllowedOrigin(url.origin)) return targetUrl;

  // Only the caller's own prefix passes through (redirect/pagination links come
  // back scoped); any other /t/... on an allowlisted origin is a cross-tenant attempt.
  const ownPrefix = `/t/${tenantId}`;
  if (url.pathname === ownPrefix || url.pathname.startsWith(`${ownPrefix}/`)) return targetUrl;
  if (url.pathname.startsWith("/t/")) {
    throw new Error("Cross-tenant FHIR path is not allowed.");
  }

  url.pathname = `/t/${tenantId}${url.pathname}`;
  return url.toString();
}
