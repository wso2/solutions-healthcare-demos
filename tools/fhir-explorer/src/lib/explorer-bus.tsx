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

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Cross-tab coordination: one panel opens another tab with fields prefilled; each prefill is consumed exactly once by the target panel. */

export interface WritePrefill {
  op: "update" | "create" | "patch";
  type: string;
  id: string;
  body: string;
  ifMatch?: string;
}

export interface RawPrefill {
  method: string;
  path: string;
}

interface ExplorerBus {
  tab: string;
  setTab: (tab: string) => void;
  writePrefill: WritePrefill | null;
  openWrite: (prefill: WritePrefill) => void;
  consumeWritePrefill: () => WritePrefill | null;
  rawPrefill: RawPrefill | null;
  openRaw: (prefill: RawPrefill) => void;
  consumeRawPrefill: () => RawPrefill | null;
  openRead: (type: string, id: string) => void;
  readPrefill: { type: string; id: string } | null;
  consumeReadPrefill: () => { type: string; id: string } | null;
}

const Ctx = createContext<ExplorerBus | null>(null);

export function ExplorerBusProvider({
  tab,
  setTab,
  children,
}: {
  tab: string;
  setTab: (tab: string) => void;
  children: ReactNode;
}) {
  const [writePrefill, setWritePrefill] = useState<WritePrefill | null>(null);
  const [rawPrefill, setRawPrefill] = useState<RawPrefill | null>(null);
  const [readPrefill, setReadPrefill] = useState<{ type: string; id: string } | null>(null);

  // Memoized so the context value keeps its identity between renders —
  // otherwise every consumer re-renders whenever the provider does.
  const bus: ExplorerBus = useMemo(
    () => ({
      tab,
      setTab,
      writePrefill,
      openWrite: (p) => {
        setWritePrefill(p);
        setTab("write");
      },
      consumeWritePrefill: () => {
        const p = writePrefill;
        if (p) setWritePrefill(null);
        return p;
      },
      rawPrefill,
      openRaw: (p) => {
        setRawPrefill(p);
        setTab("raw");
      },
      consumeRawPrefill: () => {
        const p = rawPrefill;
        if (p) setRawPrefill(null);
        return p;
      },
      readPrefill,
      openRead: (type, id) => {
        setReadPrefill({ type, id });
        setTab("instance");
      },
      consumeReadPrefill: () => {
        const p = readPrefill;
        if (p) setReadPrefill(null);
        return p;
      },
    }),
    [tab, setTab, writePrefill, rawPrefill, readPrefill],
  );

  return <Ctx.Provider value={bus}>{children}</Ctx.Provider>;
}

export function useExplorerBus(): ExplorerBus | null {
  return useContext(Ctx);
}

/** Applies a prefill once when its tab becomes active — the consume/apply pattern every target panel repeats. */
export function useConsumePrefill<T>(
  bus: ExplorerBus | null,
  tab: string,
  prefill: T | null | undefined,
  consume: (() => T | null) | undefined,
  apply: (p: T) => void,
) {
  useEffect(() => {
    if (bus?.tab !== tab) return;
    const p = consume?.();
    if (p) apply(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus?.tab, prefill]);
}
