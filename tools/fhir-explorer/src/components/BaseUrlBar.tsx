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

import { useEffect, useState } from "react";
import type { CapabilityStatementLike } from "@/lib/fhir-types";
import { fhirFetch } from "@/lib/fhir-client";
import { CheckCircle2, XCircle, Loader2, Server } from "lucide-react";
import { LoadSampleDataButton } from "./LoadSampleDataButton";
import { RequestHistoryMenu } from "./RequestHistoryMenu";

interface Props {
  baseUrl: string;
}

export function BaseUrlBar({ baseUrl }: Props) {
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [info, setInfo] = useState<string>("");

  async function ping(url: string) {
    setStatus("checking");
    setInfo("");
    try {
      const res = await fhirFetch("/metadata", {}, url);
      if (res.ok) {
        const body = res.body as CapabilityStatementLike | undefined;
        setStatus("ok");
        setInfo(
          `FHIR ${body?.fhirVersion ?? "?"} · ${body?.software?.name ?? "server"} · ${res.durationMs}ms`,
        );
      } else {
        setStatus("fail");
        setInfo(`HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      setStatus("fail");
      setInfo((e instanceof Error && e.message) || "Network error (check CORS / server running)");
    }
  }

  useEffect(() => {
    ping(baseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  return (
    <div className="border-b bg-card">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 pr-1">
            <Server className="h-5 w-5 text-primary" />
            <span className="font-semibold">FHIR Explorer</span>
          </div>
          <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm">
            {status === "checking" && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {status === "ok" && <CheckCircle2 className="h-4 w-4 text-primary" />}
            {status === "fail" && <XCircle className="h-4 w-4 text-destructive" />}
            <span className="max-w-[320px] truncate text-muted-foreground">{info || "—"}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LoadSampleDataButton baseUrl={baseUrl} />
            <RequestHistoryMenu />
          </div>
        </div>
      </div>
    </div>
  );
}
