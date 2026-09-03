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

import { memo, useCallback, useMemo } from "react";
import JsonViewLib from "react18-json-view";
import "react18-json-view/src/style.css";
import { FHIR_R4_RESOURCE_TYPES } from "@/lib/fhir-resources";
import { useExplorerBus } from "@/lib/explorer-bus";
import { CodeBlock } from "./CodeBlock";

/** Collapsible highlighted JSON tree; FHIR `Type/id` references open the Read tab and http(s) URLs become external links. */

// Above this many total nodes the tree renderer becomes sluggish, so fall back to a flat code block.
const MAX_NODES = 20_000;
const COLLAPSE_DEPTH = 4;

const RESOURCE_TYPE_SET = new Set<string>(FHIR_R4_RESOURCE_TYPES);
const REFERENCE_RE = /^([A-Za-z]+)\/([A-Za-z0-9\-.]{1,64})$/;

function countNodes(v: unknown, budget: { n: number }): void {
  if (budget.n > MAX_NODES) return;
  budget.n++;
  if (Array.isArray(v)) for (const item of v) countNodes(item, budget);
  else if (v && typeof v === "object")
    for (const item of Object.values(v)) countNodes(item, budget);
}

export const JsonView = memo(function JsonView({ value }: { value: unknown }) {
  const bus = useExplorerBus();

  // The node walk (up to MAX_NODES) and fallback stringify are per-payload
  // costs, not per-render costs — memoize on the payload.
  const fallbackCode = useMemo(() => {
    const budget = { n: 0 };
    countNodes(value, budget);
    return budget.n > MAX_NODES ? JSON.stringify(value, null, 2) : null;
  }, [value]);

  type CustomizeNode = NonNullable<Parameters<typeof JsonViewLib>[0]["customizeNode"]>;
  const customizeNode = useCallback<CustomizeNode>(
    ({ node, indexOrName }) => {
      if (typeof node !== "string") return undefined;
      // FHIR reference — clickable, opens the Read tab prefilled.
      const ref = node.match(REFERENCE_RE);
      if (
        ref &&
        RESOURCE_TYPE_SET.has(ref[1]) &&
        (indexOrName === "reference" || typeof indexOrName === "number")
      ) {
        return (
          <span className="json-view--string">
            &quot;
            <button
              type="button"
              className="underline decoration-dotted underline-offset-2"
              onClick={() => bus?.openRead(ref[1], ref[2])}
              title={`Open ${node} in Read tab`}
            >
              {node}
            </button>
            &quot;
          </span>
        );
      }
      if (/^https?:\/\//.test(node)) {
        return (
          <span className="json-view--string">
            &quot;
            <a
              href={node}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-dotted underline-offset-2"
            >
              {node}
            </a>
            &quot;
          </span>
        );
      }
      return undefined;
    },
    [bus],
  );

  // Too many nodes for the interactive tree — fall back to a flat highlighted code block.
  if (fallbackCode !== null) {
    return <CodeBlock code={fallbackCode} />;
  }
  return (
    <div className="fhir-json-view max-h-[600px] overflow-auto rounded-md border bg-card p-3 font-mono text-xs leading-relaxed">
      <JsonViewLib
        src={value}
        collapsed={COLLAPSE_DEPTH}
        enableClipboard={false}
        customizeNode={customizeNode}
      />
    </div>
  );
});
