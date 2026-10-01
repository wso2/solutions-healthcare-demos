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

// Demo-only triage assignment: there is no assignment concept in the FHIR backend, so this is a client-side mock (localStorage) purely for showing the interaction.
const STORAGE_KEY = "care-loop-task-assignments";

export const MOCK_DOCTORS = [
  "Dr. Amara Osei",
  "Dr. Elena Marchetti",
  "Dr. Rajesh Iyer",
];

export function loadAssignments(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveAssignment(
  taskId: string,
  doctor: string | undefined,
): void {
  if (typeof window === "undefined") return;
  const next = loadAssignments();
  if (doctor) {
    next[taskId] = doctor;
  } else {
    delete next[taskId];
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
