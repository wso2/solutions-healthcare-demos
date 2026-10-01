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

import type { CSSProperties } from "react";

// The escalation decision's real record is the FHIR Task analysis-service creates - an open Task means escalated, none means stable. No probability-vs-threshold math.
export function statusBand(hasOpenTask: boolean): { label: string; style: CSSProperties } {
  if (hasOpenTask) {
    return { label: "Escalated", style: { background: "#16161a", color: "#fff" } };
  }
  return { label: "Stable", style: { color: "rgba(0,0,0,0.45)", border: "1px solid rgba(0,0,0,0.14)" } };
}
