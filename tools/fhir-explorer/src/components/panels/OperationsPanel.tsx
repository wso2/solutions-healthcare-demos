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

import { useEffect, useMemo, useState } from "react";
import { encodeFhirPathSegment } from "@/lib/fhir-client";
import { useFhirRequest } from "@/hooks/use-fhir-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JsonEditor } from "../JsonEditor";
import { BasePanel } from "./BasePanel";
import { ResourceCombobox } from "../ResourceCombobox";
import { OperationCombobox } from "../OperationCombobox";
import { OperationParamCombobox } from "../OperationParamCombobox";
import { ChoiceCards } from "../ChoiceCards";
import { RequestPreviewBar } from "../RequestPreviewBar";
import { Field } from "../Field";
import { RowSection, RemoveRowButton } from "../RowSection";
import { Play } from "lucide-react";
import { useOperations } from "@/hooks/use-operations";
import {
  buildOperationQuery,
  buildParametersResource,
  CURATED_BY_NAME,
  mustUsePost,
  operationValueHint,
  type OperationScope,
} from "@/lib/fhir-operations";

const SCOPES: { value: OperationScope; label: string; desc: string }[] = [
  { value: "system", label: "System", desc: "Server-wide, e.g. $convert" },
  { value: "type", label: "Type", desc: "On a resource type, e.g. $validate" },
  { value: "instance", label: "Instance", desc: "On one resource, e.g. $everything" },
];

export function OperationsPanel({ baseUrl }: { baseUrl: string }) {
  const [scope, setScope] = useState<OperationScope>("instance");
  const [resourceType, setResourceType] = useState("Patient");
  const [id, setId] = useState("");
  const [opName, setOpName] = useState("everything");
  // Parameter rows (name + value), mirroring the Search panel's UX.
  const [params, setParams] = useState<Array<{ k: string; v: string }>>([{ k: "", v: "" }]);
  const [methodOverride, setMethodOverride] = useState<"GET" | "POST" | null>(null);
  const [editBody, setEditBody] = useState(false);
  const [rawBody, setRawBody] = useState("");
  const { res, loading, run: send } = useFhirRequest(baseUrl);

  const { byName } = useOperations(scope, resourceType, baseUrl);
  const op = byName.get(opName);
  const inParams = useMemo(() => (op?.parameters ?? []).filter((p) => p.use === "in"), [op]);
  const byParamName = useMemo(() => new Map(inParams.map((p) => [p.name, p])), [inParams]);

  // Reset the form when the operation changes (no stale values), seeding rows with its required inputs or one empty row.
  useEffect(() => {
    const required = (CURATED_BY_NAME.get(opName)?.parameters ?? [])
      .filter((p) => p.use === "in" && p.min)
      .map((p) => ({ k: p.name, v: "" }));
    setParams(required.length ? required : [{ k: "", v: "" }]);
    setMethodOverride(null);
    setEditBody(false);
    setRawBody("");
  }, [opName, scope, resourceType]);

  // Filled rows, typed from the operation's parameter definitions where known.
  const filled = useMemo(
    () =>
      params
        .filter((p) => p.k.trim() && p.v.trim())
        .map((p) => ({ name: p.k.trim(), value: p.v, type: byParamName.get(p.k)?.type })),
    [params, byParamName],
  );

  const defaultPost = mustUsePost(op, filled);
  const method = methodOverride ?? (defaultPost ? "POST" : "GET");
  const forcedPost = mustUsePost(op, filled) && method === "GET";

  const path = useMemo(() => {
    const seg = `$${encodeFhirPathSegment(opName)}`;
    if (scope === "system") return `/${seg}`;
    const t = encodeFhirPathSegment(resourceType);
    if (scope === "type") return `/${t}/${seg}`;
    return `/${t}/${encodeFhirPathSegment(id)}/${seg}`;
  }, [scope, resourceType, id, opName]);

  const generatedBody = useMemo(
    () => JSON.stringify(buildParametersResource(filled), null, 2),
    [filled],
  );
  const query = useMemo(
    () => buildOperationQuery(filled.map((r) => ({ name: r.name, value: r.value }))),
    [filled],
  );

  const requestPath = method === "GET" && query ? `${path}?${query}` : path;
  const body = editBody ? rawBody : generatedBody;
  const needsId = scope === "instance" && !id.trim();
  const canRun = !!opName.trim() && !needsId && !loading;

  function update(i: number, field: "k" | "v", v: string) {
    setParams((p) => p.map((row, idx) => (idx === i ? { ...row, [field]: v } : row)));
  }
  function add() {
    setParams((p) => [...p, { k: "", v: "" }]);
  }
  function remove(i: number) {
    setParams((p) => p.filter((_, idx) => idx !== i));
  }

  function run() {
    const init =
      method === "POST"
        ? { method: "POST", headers: { "Content-Type": "application/fhir+json" }, body }
        : {};
    void send(requestPath, init);
  }

  const form = (
    <>
      <Field label="Scope">
        <ChoiceCards
          choices={SCOPES}
          value={scope}
          onChange={setScope}
          gridClass="grid grid-cols-3 gap-2"
        />
      </Field>

      {/* Target: resource type / id (for type & instance scope) + operation */}
      <div className="grid gap-3 sm:grid-cols-2">
        {scope !== "system" && (
          <Field label="Resource Type" htmlFor="op-type">
            <ResourceCombobox
              id="op-type"
              value={resourceType}
              onChange={setResourceType}
              baseUrl={baseUrl}
            />
          </Field>
        )}
        {scope === "instance" && (
          <Field label="ID">
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="resource id"
              className="font-mono text-sm"
            />
          </Field>
        )}
        <Field label="Operation">
          <OperationCombobox
            scope={scope}
            resourceType={resourceType}
            baseUrl={baseUrl}
            value={opName}
            onChange={setOpName}
          />
        </Field>
      </div>

      {op?.documentation && <p className="text-xs text-muted-foreground">{op.documentation}</p>}

      <Field label="Invoke as">
        <div className="flex h-9 w-fit items-center gap-3 rounded-md border bg-card px-3 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="op-method"
              checked={method === "GET"}
              onChange={() => setMethodOverride("GET")}
            />
            GET
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="op-method"
              checked={method === "POST"}
              onChange={() => setMethodOverride("POST")}
            />
            POST
          </label>
        </div>
        {forcedPost && (
          <span className="text-xs text-destructive">
            This operation needs POST (changes state or has a complex parameter).
          </span>
        )}
      </Field>

      {/* Parameters — same combobox-row UX as the Search panel */}
      <RowSection label="Parameters" addLabel="Add parameter" onAdd={add}>
        {params.map((p, i) => {
          const def = byParamName.get(p.k);
          return (
            <div key={i} className="flex gap-2">
              <div className="flex-1">
                <OperationParamCombobox
                  params={inParams}
                  value={p.k}
                  onChange={(name) => update(i, "k", name)}
                />
              </div>
              <Input
                aria-label="Parameter value"
                placeholder={operationValueHint(def?.type)}
                value={p.v}
                onChange={(e) => update(i, "v", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canRun && run()}
                className="flex-1 font-mono text-sm"
              />
              <RemoveRowButton onClick={() => remove(i)} ariaLabel="Remove parameter" />
            </div>
          );
        })}
      </RowSection>

      {/* Request preview + invoke */}
      <div className="rounded-md border bg-muted/30">
        <RequestPreviewBar method={method} path={requestPath} framed={false}>
          {method === "POST" && (
            <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={editBody}
                onChange={(e) => setEditBody(e.target.checked)}
              />
              Edit body
            </label>
          )}
          <Button onClick={run} disabled={!canRun} size="sm" className="shrink-0">
            <Play className="mr-1 h-4 w-4" />
            {loading ? "Running…" : "Invoke"}
          </Button>
        </RequestPreviewBar>
        {method === "POST" &&
          (editBody ? (
            <div className="border-t p-1">
              <JsonEditor
                ariaLabel="Request body"
                value={rawBody || generatedBody}
                onChange={setRawBody}
                rows={10}
                className="border-0"
              />
            </div>
          ) : (
            <pre className="max-h-64 overflow-auto border-t px-3 py-2 font-mono text-xs">
              {generatedBody}
            </pre>
          ))}
      </div>
    </>
  );

  return <BasePanel res={res}>{form}</BasePanel>;
}
