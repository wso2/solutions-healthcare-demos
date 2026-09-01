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

// Curated FHIR R4 operation knowledge used to drive the Operations panel.
// At runtime this is merged with the operations a server advertises in its
// CapabilityStatement (rest.operation and rest.resource[].operation), so the
// picker is accurate to the actual server while still useful before/without
// metadata. A server's CapabilityStatement only lists operation *names* (the
// parameter shapes live in the referenced OperationDefinition), so the curated
// catalogue supplies the parameter hints.

import { isKnownResourceType } from "./fhir-resources";

/** Where an operation can be invoked. */
export type OperationScope = "system" | "type" | "instance";

export interface OperationParam {
  name: string;
  /** "in" params are user-supplied inputs; "out" params are response-only. */
  use: "in" | "out";
  /** FHIR type of the parameter value (primitive or complex/resource). */
  type?: string;
  /** Minimum cardinality — used to flag required inputs. */
  min?: number;
  documentation?: string;
}

export interface OperationDef {
  /** Operation code without the leading "$" (e.g. "everything"). */
  name: string;
  /** True if the operation can change server state (forces POST). */
  affectsState: boolean;
  system: boolean;
  type: boolean;
  instance: boolean;
  /**
   * Resource types the operation applies to (for type/instance scope). Empty
   * means it applies to all resource types (e.g. $validate, $meta).
   */
  resourceTypes: readonly string[];
  parameters: readonly OperationParam[];
  documentation?: string;
}

/** FHIR primitive types that can be passed as plain query/value strings. */
const PRIMITIVE_TYPES = new Set([
  "string",
  "code",
  "uri",
  "url",
  "canonical",
  "oid",
  "id",
  "markdown",
  "boolean",
  "integer",
  "positiveInt",
  "unsignedInt",
  "decimal",
  "date",
  "dateTime",
  "instant",
  "time",
  "base64Binary",
  "uuid",
]);

const NUMERIC_TYPES = new Set(["integer", "positiveInt", "unsignedInt", "decimal"]);

export function isPrimitiveType(type?: string): boolean {
  return !!type && PRIMITIVE_TYPES.has(type);
}

/**
 * A pragmatic catalogue of the most-used FHIR R4 operations. Not exhaustive —
 * the server's CapabilityStatement augments it with anything else it supports.
 */
export const CURATED_OPERATIONS: readonly OperationDef[] = [
  {
    name: "everything",
    affectsState: false,
    system: false,
    type: false,
    instance: true,
    resourceTypes: ["Patient", "Encounter", "Group", "List"],
    documentation: "Return the resource and everything in its compartment.",
    parameters: [
      { name: "start", use: "in", type: "date", documentation: "Care date range start" },
      { name: "end", use: "in", type: "date", documentation: "Care date range end" },
      {
        name: "_since",
        use: "in",
        type: "instant",
        documentation: "Only resources changed after this time",
      },
      {
        name: "_type",
        use: "in",
        type: "code",
        documentation: "Comma-separated resource types to include",
      },
      { name: "_count", use: "in", type: "integer", documentation: "Page size" },
    ],
  },
  {
    name: "validate",
    affectsState: false,
    system: false,
    type: true,
    instance: true,
    resourceTypes: [],
    documentation: "Check whether a resource is valid (optionally against a profile).",
    parameters: [
      {
        name: "resource",
        use: "in",
        type: "Resource",
        min: 0,
        documentation: "The resource to validate (JSON)",
      },
      {
        name: "mode",
        use: "in",
        type: "code",
        documentation: "create | update | delete | profile",
      },
      {
        name: "profile",
        use: "in",
        type: "canonical",
        documentation: "Profile URL to validate against",
      },
    ],
  },
  {
    name: "meta",
    affectsState: false,
    system: true,
    type: true,
    instance: true,
    resourceTypes: [],
    documentation: "Retrieve the meta (tags, security labels, profiles) in scope.",
    parameters: [],
  },
  {
    name: "meta-add",
    affectsState: true,
    system: false,
    type: false,
    instance: true,
    resourceTypes: [],
    documentation: "Add tags/profiles/security labels to a resource's meta.",
    parameters: [
      { name: "meta", use: "in", type: "Meta", min: 1, documentation: "Meta to add (JSON)" },
    ],
  },
  {
    name: "meta-delete",
    affectsState: true,
    system: false,
    type: false,
    instance: true,
    resourceTypes: [],
    documentation: "Remove tags/profiles/security labels from a resource's meta.",
    parameters: [
      { name: "meta", use: "in", type: "Meta", min: 1, documentation: "Meta to remove (JSON)" },
    ],
  },
  {
    name: "expand",
    affectsState: false,
    system: false,
    type: true,
    instance: true,
    resourceTypes: ["ValueSet"],
    documentation: "Expand a ValueSet into the codes it contains.",
    parameters: [
      { name: "url", use: "in", type: "uri", documentation: "Canonical URL of the ValueSet" },
      {
        name: "filter",
        use: "in",
        type: "string",
        documentation: "Text filter applied to the codes",
      },
      { name: "count", use: "in", type: "integer", documentation: "Max codes to return" },
      { name: "offset", use: "in", type: "integer", documentation: "Paging offset" },
      {
        name: "includeDesignations",
        use: "in",
        type: "boolean",
        documentation: "Include designations",
      },
      {
        name: "displayLanguage",
        use: "in",
        type: "code",
        documentation: "Preferred display language",
      },
    ],
  },
  {
    name: "validate-code",
    affectsState: false,
    system: false,
    type: true,
    instance: true,
    resourceTypes: ["ValueSet", "CodeSystem"],
    documentation: "Check whether a code is a member of a ValueSet / CodeSystem.",
    parameters: [
      {
        name: "url",
        use: "in",
        type: "uri",
        documentation: "Canonical URL of the value set/code system",
      },
      { name: "code", use: "in", type: "code", documentation: "Code to validate" },
      { name: "system", use: "in", type: "uri", documentation: "Code system of the code" },
      {
        name: "display",
        use: "in",
        type: "string",
        documentation: "Display to validate against the code",
      },
    ],
  },
  {
    name: "lookup",
    affectsState: false,
    system: false,
    type: true,
    instance: false,
    resourceTypes: ["CodeSystem"],
    documentation: "Look up details (display, properties) about a code.",
    parameters: [
      { name: "code", use: "in", type: "code", documentation: "Code to look up" },
      { name: "system", use: "in", type: "uri", documentation: "Code system URL" },
      { name: "version", use: "in", type: "string", documentation: "Code system version" },
      { name: "property", use: "in", type: "code", documentation: "Properties to return" },
    ],
  },
  {
    name: "subsumes",
    affectsState: false,
    system: false,
    type: true,
    instance: false,
    resourceTypes: ["CodeSystem"],
    documentation: "Test the subsumption relationship between two codes.",
    parameters: [
      { name: "codeA", use: "in", type: "code", documentation: "First code" },
      { name: "codeB", use: "in", type: "code", documentation: "Second code" },
      { name: "system", use: "in", type: "uri", documentation: "Code system URL" },
    ],
  },
  {
    name: "translate",
    affectsState: false,
    system: false,
    type: true,
    instance: true,
    resourceTypes: ["ConceptMap"],
    documentation: "Translate a code from one value set to another via a ConceptMap.",
    parameters: [
      { name: "url", use: "in", type: "uri", documentation: "Canonical URL of the ConceptMap" },
      { name: "code", use: "in", type: "code", documentation: "Code to translate" },
      { name: "system", use: "in", type: "uri", documentation: "Code system of the code" },
      { name: "source", use: "in", type: "uri", documentation: "Source value set" },
      { name: "target", use: "in", type: "uri", documentation: "Target value set" },
    ],
  },
  {
    name: "document",
    affectsState: false,
    system: false,
    type: false,
    instance: true,
    resourceTypes: ["Composition"],
    documentation: "Generate a document Bundle from a Composition.",
    parameters: [
      {
        name: "persist",
        use: "in",
        type: "boolean",
        documentation: "Persist the generated Bundle",
      },
    ],
  },
  {
    name: "apply",
    affectsState: false,
    system: false,
    type: true,
    instance: true,
    resourceTypes: ["PlanDefinition", "ActivityDefinition"],
    documentation: "Apply a definition to a subject, producing a request resource.",
    parameters: [
      {
        name: "subject",
        use: "in",
        type: "string",
        min: 1,
        documentation: "Subject reference, e.g. Patient/123",
      },
      { name: "encounter", use: "in", type: "string", documentation: "Encounter reference" },
      { name: "practitioner", use: "in", type: "string", documentation: "Practitioner reference" },
    ],
  },
  {
    name: "match",
    affectsState: false,
    system: false,
    type: true,
    instance: false,
    resourceTypes: ["Patient"],
    documentation: "Find candidate patient records that match the supplied demographics.",
    parameters: [
      {
        name: "resource",
        use: "in",
        type: "Resource",
        min: 1,
        documentation: "A Patient resource to match (JSON)",
      },
      {
        name: "onlyCertainMatches",
        use: "in",
        type: "boolean",
        documentation: "Only return high-confidence matches",
      },
      { name: "count", use: "in", type: "integer", documentation: "Max matches to return" },
    ],
  },
  {
    name: "export",
    affectsState: false,
    system: true,
    type: true,
    instance: true,
    resourceTypes: ["Patient", "Group"],
    documentation: "Bulk Data export (async). Returns a polling location.",
    parameters: [
      {
        name: "_outputFormat",
        use: "in",
        type: "string",
        documentation: "Output format, e.g. application/fhir+ndjson",
      },
      {
        name: "_since",
        use: "in",
        type: "instant",
        documentation: "Only resources changed after this time",
      },
      {
        name: "_type",
        use: "in",
        type: "string",
        documentation: "Comma-separated resource types to export",
      },
    ],
  },
  {
    name: "snapshot",
    affectsState: false,
    system: false,
    type: true,
    instance: false,
    resourceTypes: ["StructureDefinition"],
    documentation: "Generate the snapshot view of a StructureDefinition.",
    parameters: [
      {
        name: "definition",
        use: "in",
        type: "StructureDefinition",
        documentation: "The definition (JSON)",
      },
      { name: "url", use: "in", type: "uri", documentation: "Canonical URL of the definition" },
    ],
  },
  {
    name: "convert",
    affectsState: false,
    system: true,
    type: false,
    instance: false,
    resourceTypes: [],
    documentation: "Convert a resource between FHIR formats/versions.",
    parameters: [
      {
        name: "input",
        use: "in",
        type: "Resource",
        min: 1,
        documentation: "The resource to convert (JSON)",
      },
    ],
  },
];

export const CURATED_BY_NAME: ReadonlyMap<string, OperationDef> = new Map(
  CURATED_OPERATIONS.map((op) => [op.name, op]),
);

/** True if `op` can be invoked at the given scope. */
export function operationInScope(op: OperationDef, scope: OperationScope): boolean {
  return scope === "system" ? op.system : scope === "type" ? op.type : op.instance;
}

/** True if `op` applies to the given resource type (or to all types). */
export function operationAppliesTo(op: OperationDef, resourceType: string): boolean {
  return op.resourceTypes.length === 0 || op.resourceTypes.includes(resourceType);
}

/**
 * Whether an operation must be POSTed: it changes state, or any supplied input
 * value is a complex/resource type (which can't be a query parameter). Per the
 * FHIR spec, GET is only allowed when affectsState is false and every input is
 * a primitive.
 */
export function mustUsePost(
  op: OperationDef | undefined,
  filled: ReadonlyArray<{ name: string; type?: string }> = [],
): boolean {
  if (op?.affectsState) return true;
  return filled.some((p) => p.type && !isPrimitiveType(p.type));
}

/** Treat a type name as a resource (goes in Parameters.resource, not value[x]). */
function isResourceType(type?: string): boolean {
  return !!type && (type === "Resource" || type === "Bundle" || isKnownResourceType(type));
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Build a single FHIR Parameters.parameter entry for a name/value pair, typing
 * the value according to the parameter definition. Complex/resource values are
 * parsed as JSON; primitives are coerced (numbers, booleans) where known.
 * Falls back to valueString when JSON parsing fails, so the UI never throws.
 */
export function parameterEntry(
  name: string,
  rawValue: string,
  type?: string,
): Record<string, unknown> {
  const value = rawValue.trim();
  if (isResourceType(type)) {
    try {
      return { name, resource: JSON.parse(value) };
    } catch {
      return { name, valueString: rawValue };
    }
  }
  if (type && !isPrimitiveType(type)) {
    // Complex datatype (Coding, CodeableConcept, Meta, Reference, …) — JSON.
    try {
      return { name, [`value${capitalize(type)}`]: JSON.parse(value) };
    } catch {
      return { name, valueString: rawValue };
    }
  }
  if (type && NUMERIC_TYPES.has(type)) {
    const n = Number(value);
    return { name, [`value${capitalize(type)}`]: Number.isFinite(n) ? n : rawValue };
  }
  if (type === "boolean") {
    return { name, valueBoolean: value === "true" };
  }
  const key = type ? `value${capitalize(type)}` : "valueString";
  return { name, [key]: rawValue };
}

/** Build a FHIR Parameters resource from filled name/value rows. */
export function buildParametersResource(
  rows: ReadonlyArray<{ name: string; value: string; type?: string }>,
): { resourceType: "Parameters"; parameter: Record<string, unknown>[] } {
  return {
    resourceType: "Parameters",
    parameter: rows
      .filter((r) => r.name.trim() && r.value.trim())
      .map((r) => parameterEntry(r.name.trim(), r.value, r.type)),
  };
}

/** Build a query string from filled name/value rows (for GET invocation). */
export function buildOperationQuery(rows: ReadonlyArray<{ name: string; value: string }>): string {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => `${encodeURIComponent(r.name.trim())}=${encodeURIComponent(r.value)}`)
    .join("&");
}

const VALUE_HINTS: Record<string, string> = {
  date: "2024-01-01",
  dateTime: "2024-01-01T00:00:00Z",
  instant: "2024-01-01T00:00:00Z",
  boolean: "true | false",
  integer: "10",
  positiveInt: "10",
  unsignedInt: "0",
  decimal: "1.5",
  uri: "http://example.org/...",
  url: "http://example.org/...",
  canonical: "http://hl7.org/fhir/StructureDefinition/...",
  code: "a-code",
  Resource: '{ "resourceType": "Patient", … }',
  Meta: '{ "tag": [ … ] }',
  Coding: '{ "system": "…", "code": "…" }',
};

/** Example/placeholder hint for an operation parameter value, based on type. */
export function operationValueHint(type?: string): string {
  return (type && VALUE_HINTS[type]) || "value";
}
