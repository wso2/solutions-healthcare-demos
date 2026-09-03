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
import type { ResourceLike } from "@/lib/fhir-types";
import { encodeFhirPathSegment } from "@/lib/fhir-client";
import { useFhirRequest } from "@/hooks/use-fhir-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";
import { ResourceCombobox } from "../ResourceCombobox";
import { BasePanel } from "./BasePanel";
import { ChoiceCards } from "../ChoiceCards";
import { RequestPreviewBar } from "../RequestPreviewBar";
import { Field } from "../Field";
import { useExplorerBus, useConsumePrefill } from "@/lib/explorer-bus";

type Op = "read" | "vread" | "history" | "type-history" | "system-history" | "everything";

export function InstancePanel({ baseUrl }: { baseUrl: string }) {
  const [op, setOp] = useState<Op>("read");
  const [type, setType] = useState("Patient");
  const [id, setId] = useState("");
  const [vid, setVid] = useState("1");
  const [extra, setExtra] = useState("");
  const { res, loading, run: send } = useFhirRequest(baseUrl);
  const bus = useExplorerBus();

  // Reference clicks in a JSON view land here with a type+id to read.
  useConsumePrefill(bus, "instance", bus?.readPrefill, bus?.consumeReadPrefill, (p) => {
    setOp("read");
    setType(p.type);
    setId(p.id);
    runWith("read", p.type, p.id);
  });

  function runWith(op: Op, type: string, id: string) {
    const t = encodeFhirPathSegment(type);
    const i = encodeFhirPathSegment(id);
    const v = encodeFhirPathSegment(vid);
    let path = "";
    switch (op) {
      case "read":
        path = `/${t}/${i}`;
        break;
      case "vread":
        path = `/${t}/${i}/_history/${v}`;
        break;
      case "history":
        path = `/${t}/${i}/_history`;
        break;
      case "type-history":
        path = `/${t}/_history`;
        break;
      case "system-history":
        path = `/_history`;
        break;
      case "everything":
        path = `/${t}/${i}/$everything`;
        break;
    }
    if (extra.trim()) path += (path.includes("?") ? "&" : "?") + extra.trim().replace(/^\?/, "");
    void send(path);
  }

  const run = () => runWith(op, type, id);

  const ops: { value: Op; label: string; desc: string }[] = [
    { value: "read", label: "Read", desc: "Current version of one resource" },
    { value: "vread", label: "VRead", desc: "One specific version" },
    { value: "history", label: "Instance History", desc: "All versions of one resource" },
    { value: "type-history", label: "Type History", desc: "Changes across a resource type" },
    { value: "system-history", label: "System History", desc: "Changes across the whole server" },
    { value: "everything", label: "$everything", desc: "Patient record + linked resources" },
  ];

  const usesType = op !== "system-history";
  const usesId = op !== "type-history" && op !== "system-history";
  const usesVid = op === "vread";

  const previewPath = (() => {
    switch (op) {
      case "read":
        return `/${type}/${id || "{id}"}`;
      case "vread":
        return `/${type}/${id || "{id}"}/_history/${vid || "{vid}"}`;
      case "history":
        return `/${type}/${id || "{id}"}/_history`;
      case "type-history":
        return `/${type}/_history`;
      case "system-history":
        return `/_history`;
      case "everything":
        return `/${type}/${id || "{id}"}/$everything`;
    }
  })();

  // "Edit this resource" on a successful read jumps to Create/Update with body, id and ETag prefilled.
  const readBody = res?.body as ResourceLike | undefined;
  const canEdit =
    op === "read" &&
    res?.ok &&
    readBody &&
    typeof readBody === "object" &&
    typeof readBody.resourceType === "string" &&
    readBody.resourceType !== "Bundle" &&
    readBody.resourceType !== "OperationOutcome";

  function editCurrent() {
    if (!canEdit || !readBody?.resourceType) return;
    bus?.openWrite({
      op: "update",
      type: readBody.resourceType,
      id: readBody.id ?? id,
      body: JSON.stringify(readBody, null, 2),
      ifMatch: res?.headers["etag"] ?? "",
    });
  }

  return (
    <BasePanel
      res={res}
      responseExtra={
        canEdit && (
          <Button size="sm" variant="secondary" onClick={editCurrent}>
            <Pencil className="mr-1 h-4 w-4" />
            Edit this resource
          </Button>
        )
      }
    >
      <Field label="Interaction">
        <ChoiceCards choices={ops} value={op} onChange={setOp} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        {usesType && (
          <Field label="Resource Type" htmlFor="instance-type">
            <ResourceCombobox
              id="instance-type"
              value={type}
              onChange={setType}
              baseUrl={baseUrl}
            />
          </Field>
        )}
        {usesId && (
          <Field label="ID">
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="resource id"
              className="font-mono text-sm"
            />
          </Field>
        )}
        {usesVid && (
          <Field label="Version">
            <Input
              value={vid}
              onChange={(e) => setVid(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="version id"
              className="font-mono text-sm"
            />
          </Field>
        )}
      </div>

      <Field
        label={
          <>
            Extra query <span className="font-normal text-muted-foreground">(optional)</span>
          </>
        }
      >
        <Input
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="_count=20&_since=2024-01-01T00:00:00Z"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Appended to the request as-is — paging, _since, _count, …
        </p>
      </Field>

      <RequestPreviewBar
        method="GET"
        path={previewPath + (extra.trim() ? `?${extra.trim().replace(/^\?/, "")}` : "")}
      >
        <Button onClick={run} disabled={loading} size="sm">
          {loading ? "Loading…" : "Run"}
        </Button>
      </RequestPreviewBar>
    </BasePanel>
  );
}
