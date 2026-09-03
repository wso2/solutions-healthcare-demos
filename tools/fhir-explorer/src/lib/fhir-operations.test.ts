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
import {
  CURATED_BY_NAME,
  buildOperationQuery,
  buildParametersResource,
  isPrimitiveType,
  mustUsePost,
  operationAppliesTo,
  operationInScope,
  parameterEntry,
} from "./fhir-operations";

describe("operation scope & applicability", () => {
  const everything = CURATED_BY_NAME.get("everything")!;
  const validate = CURATED_BY_NAME.get("validate")!;

  it("filters by scope", () => {
    expect(operationInScope(everything, "instance")).toBe(true);
    expect(operationInScope(everything, "system")).toBe(false);
    expect(operationInScope(validate, "type")).toBe(true);
  });

  it("filters by resource type, with empty list meaning all types", () => {
    expect(operationAppliesTo(everything, "Patient")).toBe(true);
    expect(operationAppliesTo(everything, "Observation")).toBe(false);
    // $validate has no resourceTypes restriction → applies everywhere.
    expect(operationAppliesTo(validate, "Observation")).toBe(true);
  });
});

describe("mustUsePost", () => {
  const everything = CURATED_BY_NAME.get("everything")!;
  const metaAdd = CURATED_BY_NAME.get("meta-add")!;

  it("is false for a read-only op with only primitive inputs", () => {
    expect(mustUsePost(everything, [{ name: "_count", type: "integer" }])).toBe(false);
  });

  it("is true when the op affects state", () => {
    expect(mustUsePost(metaAdd, [])).toBe(true);
  });

  it("is true when any supplied input is a complex/resource type", () => {
    expect(mustUsePost(everything, [{ name: "resource", type: "Resource" }])).toBe(true);
    expect(mustUsePost(everything, [{ name: "x", type: "Coding" }])).toBe(true);
  });
});

describe("isPrimitiveType", () => {
  it("recognises FHIR primitives and rejects complex/resource types", () => {
    expect(isPrimitiveType("string")).toBe(true);
    expect(isPrimitiveType("integer")).toBe(true);
    expect(isPrimitiveType("Resource")).toBe(false);
    expect(isPrimitiveType("Coding")).toBe(false);
    expect(isPrimitiveType(undefined)).toBe(false);
  });
});

describe("parameterEntry typing", () => {
  it("coerces numeric primitives", () => {
    expect(parameterEntry("count", "5", "integer")).toEqual({ name: "count", valueInteger: 5 });
  });

  it("coerces booleans", () => {
    expect(parameterEntry("persist", "true", "boolean")).toEqual({
      name: "persist",
      valueBoolean: true,
    });
  });

  it("emits value<Type> for string-ish primitives", () => {
    expect(parameterEntry("mode", "create", "code")).toEqual({ name: "mode", valueCode: "create" });
    expect(parameterEntry("url", "http://x", "uri")).toEqual({ name: "url", valueUri: "http://x" });
  });

  it("parses resource values into a resource entry", () => {
    expect(parameterEntry("resource", '{"resourceType":"Patient"}', "Resource")).toEqual({
      name: "resource",
      resource: { resourceType: "Patient" },
    });
  });

  it("parses complex datatypes into value<Type>", () => {
    expect(parameterEntry("meta", '{"tag":[]}', "Meta")).toEqual({
      name: "meta",
      valueMeta: { tag: [] },
    });
  });

  it("falls back to valueString when complex JSON is invalid", () => {
    expect(parameterEntry("resource", "not json", "Resource")).toEqual({
      name: "resource",
      valueString: "not json",
    });
  });

  it("defaults to valueString when no type is known", () => {
    expect(parameterEntry("foo", "bar")).toEqual({ name: "foo", valueString: "bar" });
  });
});

describe("buildParametersResource", () => {
  it("builds a Parameters resource and skips empty rows", () => {
    const out = buildParametersResource([
      { name: "mode", value: "create", type: "code" },
      { name: "_count", value: "10", type: "integer" },
      { name: "blank", value: "", type: "string" },
    ]);
    expect(out).toEqual({
      resourceType: "Parameters",
      parameter: [
        { name: "mode", valueCode: "create" },
        { name: "_count", valueInteger: 10 },
      ],
    });
  });
});

describe("buildOperationQuery", () => {
  it("url-encodes names and values and joins with &", () => {
    expect(
      buildOperationQuery([
        { name: "_count", value: "10" },
        { name: "_type", value: "Observation,Condition" },
        { name: "skip", value: "" },
      ]),
    ).toBe("_count=10&_type=Observation%2CCondition&skip=");
  });
});
