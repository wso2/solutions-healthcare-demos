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
import { useCapabilityResources, useSystemOperations } from "./use-capabilities";
import {
  CURATED_OPERATIONS,
  CURATED_BY_NAME,
  operationAppliesTo,
  operationInScope,
  type OperationDef,
  type OperationScope,
} from "@/lib/fhir-operations";

export interface AvailableOperation extends OperationDef {
  /** True if the server's CapabilityStatement advertises this operation. */
  advertised: boolean;
}

export interface ResourceOperations {
  /** Operations applicable at the chosen scope/resource type, deduped + sorted. */
  operations: AvailableOperation[];
  /** Lookup by operation name (without "$"). */
  byName: Map<string, AvailableOperation>;
}

/**
 * Operations available for the given scope (and resource type, for type/instance
 * scope), merging the curated catalogue with what the server advertises in its
 * CapabilityStatement. A CapabilityStatement lists operation *names* only, so
 * advertised ops that aren't curated still appear (with no parameter hints).
 */
export function useOperations(
  scope: OperationScope,
  resourceType: string,
  baseUrl: string,
): ResourceOperations {
  const resources = useCapabilityResources(baseUrl);
  const systemOps = useSystemOperations(baseUrl);

  return useMemo(() => {
    const byName = new Map<string, AvailableOperation>();

    // 1. Curated operations valid at this scope (+ resource type).
    for (const op of CURATED_OPERATIONS) {
      if (!operationInScope(op, scope)) continue;
      if (scope !== "system" && !operationAppliesTo(op, resourceType)) continue;
      byName.set(op.name, { ...op, advertised: false });
    }

    // 2. Operations the server advertises at this scope.
    const advertised =
      scope === "system" ? systemOps : (resources.get(resourceType)?.operation ?? []);
    for (const adv of advertised) {
      if (!adv?.name) continue;
      const curated = CURATED_BY_NAME.get(adv.name);
      const existing = byName.get(adv.name);
      byName.set(adv.name, {
        // Prefer curated parameter shapes; otherwise a bare, paramless entry.
        ...(existing ??
          curated ?? {
            name: adv.name,
            affectsState: false,
            system: scope === "system",
            type: scope === "type",
            instance: scope === "instance",
            resourceTypes: [],
            parameters: [],
          }),
        documentation: adv.documentation ?? existing?.documentation ?? curated?.documentation,
        advertised: true,
      });
    }

    const operations = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    return { operations, byName };
  }, [resources, systemOps, scope, resourceType]);
}
