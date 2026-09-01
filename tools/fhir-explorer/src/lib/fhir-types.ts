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

/**
 * Minimal structural typings for the FHIR JSON the explorer reads.
 * Everything is optional because payloads come from arbitrary servers;
 * these types only name the fields the UI actually touches.
 */

export interface CodingLike {
  code?: string;
  display?: string;
}

export interface CodeableConceptLike {
  text?: string;
  coding?: CodingLike[];
}

export interface HumanNameLike {
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
}

export interface ResourceLike {
  resourceType?: string;
  id?: string;
  meta?: { versionId?: string };
  name?: HumanNameLike[] | string;
  code?: CodeableConceptLike;
  medicationCodeableConcept?: CodeableConceptLike;
  vaccineCode?: CodeableConceptLike;
  title?: string;
  description?: string;
  status?: string;
  class?: CodingLike;
  period?: { start?: string };
  value?: unknown;
}

export interface BundleLike {
  resourceType?: string;
  total?: number;
  entry?: { resource?: ResourceLike }[];
  link?: { relation: string; url: string }[];
}

export interface CapabilityResourceLike {
  type?: string;
  interaction?: { code: string }[];
  searchParam?: unknown[];
}

export interface CapabilityStatementLike {
  fhirVersion?: string;
  software?: { name?: string; version?: string };
  rest?: { resource?: CapabilityResourceLike[] }[];
}
