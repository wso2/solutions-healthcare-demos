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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_BASE_URL,
  getStoredBaseUrl,
  isValidBaseUrl,
  setBaseUrl,
  fhirFetch,
} from "@/lib/fhir-client";
import { CheckCircle2, XCircle, Loader2, Server } from "lucide-react";
import { LoadSampleDataButton } from "./LoadSampleDataButton";
import { RequestHistoryMenu } from "./RequestHistoryMenu";

interface Props {
  baseUrl: string;
  onChange: (url: string) => void;
}

export function BaseUrlBar({ baseUrl, onChange }: Props) {
  const [value, setValue] = useState(baseUrl);
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [info, setInfo] = useState<string>("");

  useEffect(() => setValue(baseUrl), [baseUrl]);

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

  function save() {
    const clean = value.trim().replace(/\/$/, "");
    // Reject anything that isn't a same-origin path or an http(s) URL (blocks javascript:, data:, file:, protocol-relative, …).
    if (!setBaseUrl(clean)) {
      setStatus("fail");
      setInfo("Invalid base URL — use a relative path (/fhir/r4) or an http(s) URL");
      return;
    }
    onChange(clean);
  }

  return (
    <div className="border-b bg-card">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 pr-1">
            <Server className="h-5 w-5 text-primary" />
            <span className="font-semibold">FHIR Explorer</span>
          </div>
          <div className="min-w-[260px] flex-1">
            <Label htmlFor="base" className="sr-only">
              Base URL
            </Label>
            <Input
              id="base"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder={`Base URL, e.g. ${DEFAULT_BASE_URL}`}
              className="font-mono text-sm"
            />
          </div>
          <Button onClick={save} variant="default">
            Connect
          </Button>
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

export function useBaseUrl() {
  const [baseUrl, set] = useState<string>(DEFAULT_BASE_URL);
  useEffect(() => {
    const stored = getStoredBaseUrl();
    if (stored) {
      set(stored);
      return;
    }
    // Nothing saved yet: ask the server for the deployment's default so fresh
    // browsers land on the deployed FHIR server, not the local-dev default.
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: { defaultFhirBaseUrl?: string | null } | null) => {
        const url = cfg?.defaultFhirBaseUrl;
        if (!cancelled && url && isValidBaseUrl(url)) set(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return [baseUrl, set] as const;
}
