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

import { describe, expect, it } from "vitest";
import { applyTenantToFhirUrl, tenantIdFromRequest } from "@/lib/server/tenant";

function requestWithFingerprint(fingerprint?: string): Request {
  return new Request("http://localhost/api/fhir", {
    headers: fingerprint ? { "X-Client-Fingerprint": fingerprint } : {},
  });
}

describe("tenantIdFromRequest", () => {
  it("returns null when the fingerprint header is absent", () => {
    expect(tenantIdFromRequest(requestWithFingerprint())).toBeNull();
  });

  it("returns null when the fingerprint header is blank", () => {
    expect(tenantIdFromRequest(requestWithFingerprint("   "))).toBeNull();
  });

  it("derives a stable hex tenant id from the fingerprint", () => {
    const a = tenantIdFromRequest(requestWithFingerprint("203.0.113.7Mozilla/5.0"));
    const b = tenantIdFromRequest(requestWithFingerprint("203.0.113.7Mozilla/5.0"));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{24}$/);
  });

  it("derives different tenants for different fingerprints", () => {
    const a = tenantIdFromRequest(requestWithFingerprint("203.0.113.7Mozilla/5.0"));
    const b = tenantIdFromRequest(requestWithFingerprint("203.0.113.8Mozilla/5.0"));
    expect(a).not.toBe(b);
  });
});

describe("applyTenantToFhirUrl", () => {
  const tenant = "abc123";

  it("prefixes /t/{tenant} for allowlisted origins", () => {
    expect(applyTenantToFhirUrl("http://localhost:9090/fhir/r4/Patient?name=smith", tenant)).toBe(
      "http://localhost:9090/t/abc123/fhir/r4/Patient?name=smith",
    );
  });

  it("leaves external origins untouched", () => {
    expect(applyTenantToFhirUrl("https://hapi.fhir.org/baseR4/Patient", tenant)).toBe(
      "https://hapi.fhir.org/baseR4/Patient",
    );
  });

  it("passes through the caller's own tenant-scoped path without double-prefixing", () => {
    expect(applyTenantToFhirUrl("http://localhost:9090/t/abc123/fhir/r4", tenant)).toBe(
      "http://localhost:9090/t/abc123/fhir/r4",
    );
  });

  it("rejects a foreign tenant path on an allowlisted origin", () => {
    expect(() =>
      applyTenantToFhirUrl("http://localhost:9090/t/victim999/fhir/r4/Patient", tenant),
    ).toThrow(/cross-tenant/i);
  });

  it("passes the URL through when there is no tenant", () => {
    expect(applyTenantToFhirUrl("http://localhost:9090/fhir/r4", null)).toBe(
      "http://localhost:9090/fhir/r4",
    );
  });
});
