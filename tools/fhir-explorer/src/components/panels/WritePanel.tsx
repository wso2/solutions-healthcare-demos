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

import { useState } from "react";
import { encodeFhirPathSegment } from "@/lib/fhir-client";
import { useExplorerBus, useConsumePrefill } from "@/lib/explorer-bus";
import { useFhirRequest } from "@/hooks/use-fhir-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JsonEditor } from "../JsonEditor";
import { ResourceCombobox } from "../ResourceCombobox";
import { ChoiceCards } from "../ChoiceCards";
import { RequestPreviewBar } from "../RequestPreviewBar";
import { BasePanel } from "./BasePanel";
import { Field } from "../Field";

type Op = "create" | "update" | "patch" | "delete" | "validate";

const SAMPLES: Record<string, string> = {
  Patient: JSON.stringify(
    {
      resourceType: "Patient",
      name: [{ family: "Smith", given: ["Alice"] }],
      gender: "female",
      birthDate: "1990-05-15",
    },
    null,
    2,
  ),
  Observation: JSON.stringify(
    {
      resourceType: "Observation",
      status: "final",
      code: { text: "Heart rate" },
      valueQuantity: { value: 72, unit: "beats/min" },
    },
    null,
    2,
  ),
};

export function WritePanel({ baseUrl }: { baseUrl: string }) {
  const [op, setOp] = useState<Op>("create");
  const [type, setType] = useState("Patient");
  const [id, setId] = useState("");
  const [ifMatch, setIfMatch] = useState("");
  const [body, setBody] = useState(SAMPLES.Patient);
  const { res, loading, run: send } = useFhirRequest(baseUrl);
  const bus = useExplorerBus();

  // "Edit this resource" from the Read tab lands here fully prefilled.
  useConsumePrefill(bus, "write", bus?.writePrefill, bus?.consumeWritePrefill, (p) => {
    setOp(p.op);
    setType(p.type);
    setId(p.id);
    setBody(p.body);
    setIfMatch(p.ifMatch ?? "");
  });

  function run() {
    let path = "";
    let method = "POST";
    const headers: Record<string, string> = {};
    let sendBody: string | undefined = body;

    const t = encodeFhirPathSegment(type);
    const i = encodeFhirPathSegment(id);
    switch (op) {
      case "create":
        path = `/${t}`;
        method = "POST";
        break;
      case "update":
        path = `/${t}/${i}`;
        method = "PUT";
        if (ifMatch.trim()) headers["If-Match"] = ifMatch.trim();
        break;
      case "patch":
        path = `/${t}/${i}`;
        method = "PATCH";
        headers["Content-Type"] = "application/merge-patch+json";
        break;
      case "delete":
        path = `/${t}/${i}`;
        method = "DELETE";
        sendBody = undefined;
        break;
      case "validate":
        path = `/${t}/$validate`;
        method = "POST";
        break;
    }

    void send(path, { method, headers, body: sendBody });
  }

  const ops: { value: Op; label: string; desc: string }[] = [
    { value: "create", label: "Create", desc: "POST a new resource" },
    { value: "update", label: "Update", desc: "PUT a full replacement" },
    { value: "patch", label: "Patch", desc: "Merge-patch selected fields" },
    { value: "delete", label: "Delete", desc: "Soft-delete by id" },
    { value: "validate", label: "$validate", desc: "Check without storing" },
  ];

  const usesId = op !== "create" && op !== "validate";
  const usesIfMatch = op === "update";
  const usesBody = op !== "delete";

  const methodFor: Record<Op, string> = {
    create: "POST",
    update: "PUT",
    patch: "PATCH",
    delete: "DELETE",
    validate: "POST",
  };
  const previewPath =
    op === "create"
      ? `/${type}`
      : op === "validate"
        ? `/${type}/$validate`
        : `/${type}/${id || "{id}"}`;

  return (
    <BasePanel res={res}>
      <Field label="Interaction">
        <ChoiceCards choices={ops} value={op} onChange={setOp} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Resource Type" htmlFor="write-type">
          <ResourceCombobox
            id="write-type"
            value={type}
            onChange={(next) => {
              setType(next);
              if (SAMPLES[next]) setBody(SAMPLES[next]);
            }}
            baseUrl={baseUrl}
          />
        </Field>
        {usesId && (
          <Field label="ID">
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="resource id"
              className="font-mono text-sm"
            />
          </Field>
        )}
        {usesIfMatch && (
          <Field
            label={
              <>
                If-Match <span className="font-normal text-muted-foreground">(optional)</span>
              </>
            }
          >
            <Input
              value={ifMatch}
              onChange={(e) => setIfMatch(e.target.value)}
              placeholder={'W/"2"'}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Version ETag — server rejects the update with 412 if the resource changed.
            </p>
          </Field>
        )}
      </div>

      {usesBody && (
        <Field label={`Body (${op === "patch" ? "JSON Merge Patch" : "FHIR JSON"})`}>
          <JsonEditor value={body} onChange={setBody} rows={14} ariaLabel="Request body" />
        </Field>
      )}

      <RequestPreviewBar method={methodFor[op]} path={previewPath}>
        <Button onClick={run} disabled={loading} size="sm">
          {loading ? "Sending…" : "Send"}
        </Button>
      </RequestPreviewBar>
    </BasePanel>
  );
}
