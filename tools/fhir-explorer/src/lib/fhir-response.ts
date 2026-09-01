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

import type { FhirResponse } from "./fhir-client";

export interface OperationOutcomeIssue {
  severity?: "fatal" | "error" | "warning" | "information" | string;
  code?: string;
  diagnostics?: string;
  details?: { text?: string };
  expression?: string[];
}
export interface OperationOutcome {
  resourceType: "OperationOutcome";
  issue?: OperationOutcomeIssue[];
}

/** Returns the body as an OperationOutcome if it is one, else null. */
export function getOperationOutcome(body: unknown): OperationOutcome | null {
  if (
    body &&
    typeof body === "object" &&
    (body as { resourceType?: string }).resourceType === "OperationOutcome"
  ) {
    return body as OperationOutcome;
  }
  return null;
}

/** Human-readable text for an issue (diagnostics, falling back to details.text). */
export function issueText(issue: OperationOutcomeIssue): string {
  const parts = [issue.diagnostics || issue.details?.text || ""];
  if (issue.expression?.length) parts.push(`(${issue.expression.join(", ")})`);
  return parts.filter(Boolean).join(" ");
}

/**
 * Suggested download filename for a response. Uses the resource type + id when
 * the body is a single resource, the resource type for a Bundle, else a generic
 * name. Always ends in .json.
 */
export function responseFileName(res: FhirResponse): string {
  const body = res.body as { resourceType?: string; id?: string } | undefined;
  if (body && typeof body === "object" && body.resourceType) {
    if (body.resourceType === "Bundle") return "bundle.json";
    return body.id ? `${body.resourceType}-${body.id}.json` : `${body.resourceType}.json`;
  }
  return "response.json";
}
