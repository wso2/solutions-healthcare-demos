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
import { useExplorerBus, useConsumePrefill } from "@/lib/explorer-bus";
import { useFhirRequest } from "@/hooks/use-fhir-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JsonEditor } from "../JsonEditor";
import { BasePanel } from "./BasePanel";
import { RequestPreviewBar } from "../RequestPreviewBar";
import { Field } from "../Field";
import { RowSection, RemoveRowButton } from "../RowSection";

// Suggested names for the header rows — common FHIR/HTTP request headers.
const HEADER_SUGGESTIONS = [
  "Accept",
  "Authorization",
  "Cache-Control",
  "Content-Type",
  "If-Match",
  "If-Modified-Since",
  "If-None-Exist",
  "If-None-Match",
  "Prefer",
];

interface HeaderRow {
  k: string;
  v: string;
}

export function RawPanel({ baseUrl }: { baseUrl: string }) {
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/metadata");
  const [body, setBody] = useState("");
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([]);
  const { res, loading, run: send } = useFhirRequest(baseUrl);
  const bus = useExplorerBus();

  // Request-history entries replay here with method + path prefilled.
  useConsumePrefill(bus, "raw", bus?.rawPrefill, bus?.consumeRawPrefill, (p) => {
    setMethod(p.method);
    setPath(p.path);
  });

  function updateHeader(i: number, field: "k" | "v", value: string) {
    setHeaderRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function run() {
    const hdrs: Record<string, string> = {};
    headerRows.forEach((r) => {
      if (r.k.trim()) hdrs[r.k.trim()] = r.v.trim();
    });
    void send(path, {
      method,
      headers: hdrs,
      body: ["GET", "HEAD", "DELETE"].includes(method) ? undefined : body,
    });
  }

  return (
    <BasePanel res={res}>
      <div className="grid gap-3 sm:grid-cols-[130px_1fr]">
        <Field label="Method">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Path">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="/Patient?name=smith"
            className="font-mono text-sm"
          />
        </Field>
      </div>

      <RowSection
        label="Headers"
        addLabel="Add header"
        onAdd={() => setHeaderRows((rows) => [...rows, { k: "", v: "" }])}
      >
        {headerRows.length === 0 && (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            No extra headers — Accept and Content-Type are set automatically.
          </p>
        )}
        {headerRows.length > 0 && (
          <div className="space-y-2">
            {headerRows.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  aria-label="Header name"
                  list="raw-header-names"
                  value={r.k}
                  onChange={(e) => updateHeader(i, "k", e.target.value)}
                  placeholder="Header"
                  className="w-2/5 font-mono text-sm"
                />
                <Input
                  aria-label="Header value"
                  value={r.v}
                  onChange={(e) => updateHeader(i, "v", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && run()}
                  placeholder="value"
                  className="flex-1 font-mono text-sm"
                />
                <RemoveRowButton
                  onClick={() => setHeaderRows((rows) => rows.filter((_, idx) => idx !== i))}
                  ariaLabel="Remove header"
                />
              </div>
            ))}
          </div>
        )}
        <datalist id="raw-header-names">
          {HEADER_SUGGESTIONS.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      </RowSection>

      {!["GET", "HEAD", "DELETE"].includes(method) && (
        <Field label="Body">
          <JsonEditor value={body} onChange={setBody} rows={10} ariaLabel="Request body" />
        </Field>
      )}

      <RequestPreviewBar method={method} path={path || "/"}>
        <Button onClick={run} disabled={loading} size="sm">
          {loading ? "Sending…" : "Send"}
        </Button>
      </RequestPreviewBar>
    </BasePanel>
  );
}
