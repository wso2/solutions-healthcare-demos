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
import { Button } from "@/components/ui/button";
import { Database, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  loadManifest,
  loadSampleData,
  type LoadProgress,
  type LoadSummary,
} from "@/lib/sample-data";

interface Props {
  baseUrl: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading"; progress: LoadProgress }
  | { kind: "done"; summary: LoadSummary }
  | { kind: "error"; message: string };

const LOADED_STORAGE_PREFIX = "fhir-explorer:sample-data-loaded:";

function loadedStorageKey(baseUrl: string) {
  return `${LOADED_STORAGE_PREFIX}${baseUrl}`;
}

function wasSampleDataLoaded(baseUrl: string) {
  // Guard for SSR: this component renders on the server first, where localStorage doesn't exist.
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(loadedStorageKey(baseUrl)) === "true";
}

export function LoadSampleDataButton({ baseUrl }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  // Start false and read localStorage after mount — reading it in the initializer
  // makes the first client render differ from the server HTML (hydration mismatch).
  const [loaded, setLoaded] = useState(false);
  // Read the patient count from the manifest so the label never goes stale when the dataset is resized.
  const [patientCount, setPatientCount] = useState<number | null>(null);

  useEffect(() => {
    setState({ kind: "idle" });
    setLoaded(wasSampleDataLoaded(baseUrl));
  }, [baseUrl]);

  useEffect(() => {
    let cancelled = false;
    loadManifest().then(
      (m) => !cancelled && setPatientCount(m.patientCount ?? null),
      () => {
        /* manifest unavailable — fall back to a generic label */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function run() {
    setState({
      kind: "loading",
      progress: { index: 0, total: 0, file: "", status: "loading" },
    });
    try {
      const summary = await loadSampleData(baseUrl, (progress) =>
        setState({ kind: "loading", progress }),
      );
      setState({ kind: "done", summary });
      if (summary.failed === 0) {
        try {
          localStorage.setItem(loadedStorageKey(baseUrl), "true");
        } catch {
          /* best-effort persistence — storage full or disabled */
        }
        setLoaded(true);
      }
    } catch (e: unknown) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const busy = state.kind === "loading";
  const disabled = busy || loaded;

  const idleTitle =
    patientCount != null
      ? `Seeds ${patientCount} synthetic patients (Synthea) into ${baseUrl}`
      : `Seeds synthetic patient data (Synthea) into ${baseUrl}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={run}
        disabled={disabled}
        variant="outline"
        title={loaded ? "Sample data has already been loaded into this server" : idleTitle}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : loaded ? (
          <CheckCircle2 className="h-4 w-4 text-primary" />
        ) : (
          <Database className="h-4 w-4" />
        )}
        {loaded ? "Sample data loaded" : "Load sample data"}
      </Button>
      <StatusLine state={state} loaded={loaded} />
    </div>
  );
}

/**
 * Inline status next to the button. The button itself communicates idle and
 * fully-loaded states, so this only renders while loading or after a problem.
 */
function StatusLine({ state, loaded }: { state: State; loaded: boolean }) {
  if (state.kind === "loading") {
    const { index, total, file, status } = state.progress;
    if (total === 0) {
      return <span className="text-xs text-muted-foreground">Reading manifest…</span>;
    }
    return (
      <span className="text-xs text-muted-foreground">
        {status === "loading" ? "Posting" : "Posted"} {index + 1}/{total} —{" "}
        <span className="font-mono">{file}</span>
      </span>
    );
  }

  if (state.kind === "done" && !loaded) {
    const { ok, failed } = state.summary;
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-4 w-4" />
        {ok}/{ok + failed} bundles loaded — {state.summary.errors[0]?.message.slice(0, 80)}
      </span>
    );
  }

  if (state.kind === "error") {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-4 w-4" />
        {state.message}
      </span>
    );
  }

  return null;
}
