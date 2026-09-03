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

import { useMemo, useState } from "react";
import type { FhirResponse } from "@/lib/fhir-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { JsonView } from "./JsonView";
import { CodeBlock } from "./CodeBlock";
import {
  getOperationOutcome,
  issueText,
  responseFileName,
  type OperationOutcomeIssue,
} from "@/lib/fhir-response";

export function ResponseView({ res }: { res: FhirResponse | null }) {
  const [copied, setCopied] = useState(false);

  const pretty = useMemo(() => {
    if (!res) return "";
    if (typeof res.body === "string") return res.body;
    try {
      return JSON.stringify(res.body, null, 2);
    } catch {
      return res.raw;
    }
  }, [res]);

  if (!res) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Response will appear here.
      </div>
    );
  }

  const statusColor =
    res.status >= 200 && res.status < 300
      ? "bg-primary text-primary-foreground"
      : res.status >= 400
        ? "bg-destructive text-destructive-foreground"
        : "bg-muted text-foreground";

  const outcome = getOperationOutcome(res.body);

  async function copy() {
    try {
      await navigator.clipboard.writeText(pretty);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  function download() {
    const blob = new Blob([pretty], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = responseFileName(res!);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Badge className={`shrink-0 ${statusColor}`}>
          {res.method} {res.status}
        </Badge>
        <span className="shrink-0 text-muted-foreground">{res.durationMs}ms</span>
        <code
          className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-0.5 font-mono text-xs"
          title={res.url}
        >
          {res.url}
        </code>
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={copy}
            aria-label="Copy response JSON"
            disabled={!pretty}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={download}
            aria-label="Download response JSON"
            disabled={!pretty}
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
      </div>

      {outcome && <OperationOutcomeView issues={outcome.issue ?? []} />}

      {Object.keys(res.headers).length > 0 && <HeadersView headers={res.headers} />}

      {typeof res.body === "object" && res.body !== null ? (
        <JsonView value={res.body} />
      ) : (
        <CodeBlock code={pretty} />
      )}
    </div>
  );
}

// Headers worth surfacing without expanding — signals a FHIR user actually acts on.
const NOTABLE_HEADERS = ["etag", "last-modified", "location", "content-type"];

function HeadersView({ headers }: { headers: Record<string, string> }) {
  const [copied, setCopied] = useState(false);
  const entries = Object.entries(headers).sort(([a], [b]) => {
    const ai = NOTABLE_HEADERS.indexOf(a.toLowerCase());
    const bi = NOTABLE_HEADERS.indexOf(b.toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
  });

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(entries.map(([k, v]) => `${k}: ${v}`).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <details className="group rounded-md border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90">▸</span>
        Headers
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
          {entries.length}
        </Badge>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            void copyAll();
          }}
          className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
          aria-label="Copy all headers"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </summary>
      <div className="divide-y border-t">
        {entries.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[200px_1fr] items-baseline gap-x-4 px-3 py-1.5">
            <span className="break-all font-mono text-xs font-medium text-sky-700 dark:text-sky-300">
              {k}
            </span>
            <span className="break-all font-mono text-xs text-foreground/90">{v}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  fatal: "bg-destructive text-destructive-foreground",
  error: "bg-destructive text-destructive-foreground",
  warning: "bg-amber-500 text-white",
  information: "bg-muted text-foreground",
};

function OperationOutcomeView({ issues }: { issues: OperationOutcomeIssue[] }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5">
      <div className="border-b border-destructive/30 px-3 py-2 text-sm font-medium">
        OperationOutcome · {issues.length} issue{issues.length === 1 ? "" : "s"}
      </div>
      <ul className="divide-y divide-border">
        {issues.map((issue, i) => (
          <li key={i} className="px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn(
                  "text-[10px]",
                  SEVERITY_STYLES[issue.severity ?? ""] ?? "bg-muted text-foreground",
                )}
              >
                {issue.severity ?? "issue"}
              </Badge>
              {issue.code && (
                <span className="font-mono text-xs text-muted-foreground">{issue.code}</span>
              )}
            </div>
            {issueText(issue) && <p className="mt-1 text-sm text-foreground">{issueText(issue)}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
