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

import { describe, it, expect } from "vitest";
import { getOperationOutcome, issueText, responseFileName } from "./fhir-response";
import type { FhirResponse } from "./fhir-client";

function res(body: unknown): FhirResponse {
  return {
    status: 200,
    ok: true,
    headers: {},
    body,
    raw: "",
    url: "http://x",
    method: "GET",
    durationMs: 1,
  };
}

describe("getOperationOutcome", () => {
  it("detects an OperationOutcome body", () => {
    const oo = { resourceType: "OperationOutcome", issue: [] };
    expect(getOperationOutcome(oo)).toBe(oo);
  });
  it("returns null for other resources / non-objects", () => {
    expect(getOperationOutcome({ resourceType: "Patient" })).toBeNull();
    expect(getOperationOutcome("nope")).toBeNull();
    expect(getOperationOutcome(null)).toBeNull();
  });
});

describe("issueText", () => {
  it("prefers diagnostics, falls back to details.text", () => {
    expect(issueText({ diagnostics: "bad value" })).toBe("bad value");
    expect(issueText({ details: { text: "from details" } })).toBe("from details");
  });
  it("appends the FHIRPath expression when present", () => {
    expect(issueText({ diagnostics: "bad", expression: ["Patient.name"] })).toBe(
      "bad (Patient.name)",
    );
  });
});

describe("responseFileName", () => {
  it("uses resourceType-id for a single resource", () => {
    expect(responseFileName(res({ resourceType: "Patient", id: "123" }))).toBe("Patient-123.json");
  });
  it("uses bundle.json for a Bundle", () => {
    expect(responseFileName(res({ resourceType: "Bundle", entry: [] }))).toBe("bundle.json");
  });
  it("uses resourceType.json when there is no id", () => {
    expect(responseFileName(res({ resourceType: "Patient" }))).toBe("Patient.json");
  });
  it("falls back to response.json for non-resource bodies", () => {
    expect(responseFileName(res("plain text"))).toBe("response.json");
  });
});
