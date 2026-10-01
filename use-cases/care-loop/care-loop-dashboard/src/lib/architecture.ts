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

// Maps the real stage keys from src/lib/stages.ts onto the boxes drawn in use-cases/care-loop/assets/care-loop-architecture.png. A box lights up when any of its stageKeys has a "done"/"active" event in the selected run. Several real events fold into one architecture box because the diagram is the target-state system description, not a 1:1 rendering of every event this demo's services happen to fire.
export interface ArchitectureBoxDef {
  key: string;
  label: string;
  sublabel?: string;
  group?: string;
  stageKeys: string[];
  // "actor" boxes (Patient/EHR/Doctor) never light up from events - they're drawn for context only, per the diagram.
  isActor?: boolean;
}

export const ARCHITECTURE_BOXES: ArchitectureBoxDef[] = [
  { key: "patient", label: "Patient", stageKeys: [], isActor: true },
  { key: "apple-health", label: "Apple Health", sublabel: "Home monitoring", stageKeys: ["vitals"] },
  {
    key: "whatsapp-agent",
    label: "WhatsApp Agent",
    sublabel: "Symptom check-ins",
    stageKeys: ["quest", "sent", "respond"],
  },
  {
    key: "ml-model",
    label: "ML Model",
    group: "Decision Engine",
    sublabel: "HFrEF probability",
    stageKeys: ["ml"],
  },
  {
    key: "deterministic-rules",
    label: "Deterministic Rules",
    group: "Decision Engine",
    sublabel: "Escalation threshold",
    stageKeys: ["escalation"],
  },
  {
    key: "clinical-analysis-agent",
    label: "Clinical Analysis Agent",
    group: "Decision Engine",
    sublabel: "Agentic risk assessment",
    stageKeys: ["agentic_draft", "agentic"],
  },
  {
    key: "fhir-converter",
    label: "FHIR Converter",
    sublabel: "Task description",
    stageKeys: ["task_desc"],
  },
  {
    key: "notification-ehr-integration",
    label: "Clinical Notification + EHR Integration",
    sublabel: "FHIR Task created",
    stageKeys: ["fhir"],
  },
  {
    key: "front-desk",
    label: "Front Desk Dashboard",
    sublabel: "Flags case for review",
    stageKeys: ["clinician"],
  },
  { key: "ehr", label: "EHR", stageKeys: [], isActor: true },
  { key: "doctor", label: "Doctor", stageKeys: [], isActor: true },
];
