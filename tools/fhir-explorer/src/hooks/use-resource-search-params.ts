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

import { useMemo } from "react";
import { useCapabilityResources } from "./use-capabilities";
import {
  mergeSearchParams,
  type SearchParamDef,
  type SearchParamType,
} from "@/lib/fhir-search-params";

export interface ResourceSearchParams {
  /** Ordered: resource-specific params first, then common result/meta params. */
  params: SearchParamDef[];
  /** Lookup by parameter name (for value hints, type badges). */
  byName: Map<string, SearchParamDef>;
}

/**
 * Search parameters available for `resourceType`, merging the curated catalogue
 * with what the server advertises in its CapabilityStatement.
 */
export function useResourceSearchParams(
  resourceType: string,
  baseUrl: string,
): ResourceSearchParams {
  const resources = useCapabilityResources(baseUrl);

  return useMemo(() => {
    const fromCapability: SearchParamDef[] = (resources.get(resourceType)?.searchParam ?? []).map(
      (sp) => ({
        name: sp.name,
        type: sp.type as SearchParamType | undefined,
        documentation: sp.documentation,
      }),
    );
    const params = mergeSearchParams(resourceType, fromCapability);
    return { params, byName: new Map(params.map((p) => [p.name, p])) };
  }, [resources, resourceType]);
}
