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

import { useRef, useState } from "react";
import { fhirFetch, type FhirResponse } from "@/lib/fhir-client";

/** Shared request state for the explorer panels: latest response, loading flag, and a run() that never throws (network errors become a status-0 response). */
export function useFhirRequest(baseUrl: string) {
  const [res, setRes] = useState<FhirResponse | null>(null);
  const [loading, setLoading] = useState(false);
  // Sequence guard: only the latest run() may write state, so a slow earlier
  // request can't overwrite the result of a newer one.
  const seq = useRef(0);

  async function run(path: string, init: RequestInit = {}) {
    const id = ++seq.current;
    setLoading(true);
    try {
      const next = await fhirFetch(path, init, baseUrl);
      if (id === seq.current) setRes(next);
    } catch (e: unknown) {
      if (id === seq.current) {
        setRes({
          status: 0,
          ok: false,
          headers: {},
          body: { error: e instanceof Error ? e.message : String(e) },
          raw: "",
          url: "",
          method: typeof init.method === "string" ? init.method : "GET",
          durationMs: 0,
        });
      }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }

  return { res, loading, run };
}
