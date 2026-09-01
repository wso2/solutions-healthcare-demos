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

// Curated FHIR R4 search-parameter knowledge used to assist the Search panel.
// At runtime this is merged with the parameters a server advertises in its
// CapabilityStatement, so suggestions are accurate to the actual server while
// still useful before/without metadata.

export type SearchParamType =
  | "number"
  | "date"
  | "string"
  | "token"
  | "reference"
  | "composite"
  | "quantity"
  | "uri"
  | "special";

export interface SearchParamDef {
  name: string;
  type?: SearchParamType;
  documentation?: string;
}

/**
 * Result/meta parameters that apply to (almost) every resource type. Split out
 * so the picker can present them as a separate group.
 */
export const COMMON_SEARCH_PARAMS: readonly SearchParamDef[] = [
  { name: "_id", type: "token", documentation: "Logical id of the resource" },
  { name: "_lastUpdated", type: "date", documentation: "When the resource last changed" },
  { name: "_tag", type: "token", documentation: "Tag applied to the resource" },
  { name: "_profile", type: "uri", documentation: "Profile the resource claims to conform to" },
  { name: "_security", type: "token", documentation: "Security label on the resource" },
  { name: "_source", type: "uri", documentation: "Source system (meta.source)" },
  { name: "_text", type: "string", documentation: "Text search on the narrative" },
  { name: "_content", type: "string", documentation: "Text search on the whole resource" },
  {
    name: "_has",
    type: "special",
    documentation: "Reverse chaining (e.g. _has:Observation:patient:code)",
  },
  // Result parameters
  { name: "_sort", type: "string", documentation: "Sort order, e.g. -date,name" },
  { name: "_count", type: "number", documentation: "Page size (results per page)" },
  {
    name: "_include",
    type: "string",
    documentation: "Include referenced resources, e.g. Observation:patient",
  },
  { name: "_revinclude", type: "string", documentation: "Include resources referencing these" },
  { name: "_summary", type: "token", documentation: "true | text | data | count | false" },
  { name: "_total", type: "token", documentation: "none | estimate | accurate" },
  {
    name: "_elements",
    type: "string",
    documentation: "Comma-separated list of elements to return",
  },
];

/**
 * A pragmatic set of the most-used search parameters per common resource type.
 * Not exhaustive — the server's CapabilityStatement fills in the rest.
 */
export const CURATED_RESOURCE_SEARCH_PARAMS: Record<string, SearchParamDef[]> = {
  Patient: [
    { name: "identifier", type: "token", documentation: "A patient identifier (MRN, etc.)" },
    { name: "name", type: "string", documentation: "Any part of the name" },
    { name: "family", type: "string", documentation: "Family/last name" },
    { name: "given", type: "string", documentation: "Given/first name" },
    { name: "gender", type: "token", documentation: "male | female | other | unknown" },
    { name: "birthdate", type: "date", documentation: "Date of birth" },
    { name: "address", type: "string", documentation: "Any part of the address" },
    { name: "telecom", type: "token", documentation: "Phone/email contact" },
    { name: "phone", type: "token", documentation: "Phone contact" },
    { name: "email", type: "token", documentation: "Email contact" },
    { name: "active", type: "token", documentation: "Whether the record is active" },
    { name: "general-practitioner", type: "reference", documentation: "Patient's nominated GP" },
    { name: "organization", type: "reference", documentation: "Managing organization" },
  ],
  Observation: [
    { name: "code", type: "token", documentation: "The code of the observation type" },
    { name: "category", type: "token", documentation: "Classification, e.g. vital-signs" },
    { name: "date", type: "date", documentation: "Obtained date/time" },
    { name: "patient", type: "reference", documentation: "The patient the observation is about" },
    { name: "subject", type: "reference", documentation: "The subject of the observation" },
    { name: "encounter", type: "reference", documentation: "Encounter during which created" },
    { name: "status", type: "token", documentation: "final | preliminary | amended | ..." },
    { name: "value-quantity", type: "quantity", documentation: "Numeric value + units" },
    { name: "value-concept", type: "token", documentation: "Coded value" },
    { name: "component-code", type: "token", documentation: "Code of a component" },
    { name: "performer", type: "reference", documentation: "Who performed it" },
  ],
  Encounter: [
    { name: "patient", type: "reference", documentation: "The patient present at the encounter" },
    { name: "subject", type: "reference", documentation: "The subject of the encounter" },
    { name: "date", type: "date", documentation: "Date the encounter took place" },
    { name: "status", type: "token", documentation: "planned | arrived | in-progress | finished" },
    { name: "class", type: "token", documentation: "Classification (inpatient, ambulatory...)" },
    { name: "type", type: "token", documentation: "Specific type of encounter" },
    { name: "participant", type: "reference", documentation: "Persons involved" },
    { name: "service-provider", type: "reference", documentation: "Organization responsible" },
    { name: "location", type: "reference", documentation: "Location the encounter takes place" },
  ],
  Condition: [
    { name: "patient", type: "reference", documentation: "Who has the condition" },
    { name: "subject", type: "reference", documentation: "Who has the condition" },
    { name: "code", type: "token", documentation: "Code for the condition" },
    { name: "category", type: "token", documentation: "problem-list-item | encounter-diagnosis" },
    {
      name: "clinical-status",
      type: "token",
      documentation: "active | recurrence | resolved | ...",
    },
    { name: "verification-status", type: "token", documentation: "confirmed | provisional | ..." },
    { name: "onset-date", type: "date", documentation: "Date the condition began" },
    { name: "recorded-date", type: "date", documentation: "Date the condition was recorded" },
    { name: "encounter", type: "reference", documentation: "Encounter for the condition" },
  ],
  Practitioner: [
    { name: "identifier", type: "token", documentation: "A practitioner identifier" },
    { name: "name", type: "string", documentation: "Any part of the name" },
    { name: "family", type: "string", documentation: "Family/last name" },
    { name: "given", type: "string", documentation: "Given/first name" },
    { name: "gender", type: "token", documentation: "male | female | other | unknown" },
    { name: "active", type: "token", documentation: "Whether the record is active" },
    { name: "telecom", type: "token", documentation: "Phone/email contact" },
  ],
  Organization: [
    { name: "identifier", type: "token", documentation: "An organization identifier" },
    { name: "name", type: "string", documentation: "Any part of the name" },
    { name: "type", type: "token", documentation: "Kind of organization" },
    { name: "address", type: "string", documentation: "Any part of the address" },
    { name: "active", type: "token", documentation: "Whether the record is active" },
  ],
  MedicationRequest: [
    { name: "patient", type: "reference", documentation: "The patient the request is for" },
    { name: "subject", type: "reference", documentation: "The subject of the request" },
    { name: "status", type: "token", documentation: "active | completed | stopped | ..." },
    { name: "intent", type: "token", documentation: "proposal | plan | order | ..." },
    { name: "code", type: "token", documentation: "Medication code" },
    { name: "authoredon", type: "date", documentation: "When request was authored" },
    { name: "requester", type: "reference", documentation: "Who/what requested it" },
    { name: "encounter", type: "reference", documentation: "Encounter for the request" },
  ],
  Procedure: [
    { name: "patient", type: "reference", documentation: "The patient the procedure is for" },
    { name: "subject", type: "reference", documentation: "The subject of the procedure" },
    { name: "code", type: "token", documentation: "Procedure code" },
    { name: "date", type: "date", documentation: "When the procedure was performed" },
    { name: "status", type: "token", documentation: "preparation | in-progress | completed" },
    { name: "encounter", type: "reference", documentation: "Encounter for the procedure" },
  ],
  DiagnosticReport: [
    { name: "patient", type: "reference", documentation: "The subject of the report" },
    { name: "subject", type: "reference", documentation: "The subject of the report" },
    { name: "code", type: "token", documentation: "The code for the report" },
    { name: "category", type: "token", documentation: "Service category, e.g. LAB" },
    { name: "date", type: "date", documentation: "Clinically relevant time" },
    { name: "status", type: "token", documentation: "registered | partial | final | ..." },
    { name: "encounter", type: "reference", documentation: "Encounter for the report" },
  ],
  AllergyIntolerance: [
    { name: "patient", type: "reference", documentation: "Who the allergy is for" },
    { name: "code", type: "token", documentation: "Allergy/substance code" },
    { name: "clinical-status", type: "token", documentation: "active | inactive | resolved" },
    {
      name: "category",
      type: "token",
      documentation: "food | medication | environment | biologic",
    },
    { name: "date", type: "date", documentation: "Date recorded" },
  ],
  Immunization: [
    { name: "patient", type: "reference", documentation: "The patient for the vaccination" },
    { name: "status", type: "token", documentation: "completed | entered-in-error | not-done" },
    { name: "date", type: "date", documentation: "Vaccination (non-)administration date" },
    { name: "vaccine-code", type: "token", documentation: "Vaccine product code" },
  ],
};

const VALUE_HINTS: Record<SearchParamType, string> = {
  token: "code or system|code",
  date: "eq2024-01-01 · ge2024-01-01 · le…",
  reference: "Patient/123 or identifier|value",
  string: "text (starts-with match)",
  number: "10 · gt5 · le100",
  quantity: "5.4|http://unitsofmeasure.org|mg",
  uri: "http://example.org/profile",
  composite: "code$value",
  special: "special syntax",
};

/** Example/placeholder hint for a parameter value, based on its type. */
export function valueHintForType(type?: SearchParamType): string {
  return (type && VALUE_HINTS[type]) || "value";
}

/**
 * Merge curated + capability-advertised search params for a resource type into
 * a single deduped list: resource-specific params first (alphabetical), then the
 * common result/meta params. Capability docs/types win over curated ones.
 */
export function mergeSearchParams(
  resourceType: string,
  fromCapability: readonly SearchParamDef[] = [],
): SearchParamDef[] {
  const commonNames = new Set(COMMON_SEARCH_PARAMS.map((p) => p.name));
  const byName = new Map<string, SearchParamDef>();

  // Curated first (baseline), then capability overrides/augments.
  for (const p of CURATED_RESOURCE_SEARCH_PARAMS[resourceType] ?? []) {
    byName.set(p.name, { ...p });
  }
  for (const p of fromCapability) {
    if (!p?.name) continue;
    const prev = byName.get(p.name);
    byName.set(p.name, {
      name: p.name,
      type: p.type ?? prev?.type,
      documentation: p.documentation ?? prev?.documentation,
    });
  }

  const resourceSpecific = [...byName.values()]
    .filter((p) => !commonNames.has(p.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...resourceSpecific, ...COMMON_SEARCH_PARAMS.map((p) => ({ ...p }))];
}
