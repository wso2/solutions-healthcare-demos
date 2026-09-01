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

/** Rolling localStorage log of recent requests; fhirFetch records them, the header menu lists and replays them via the Raw tab. */

export interface HistoryEntry {
  method: string;
  /** Path as passed to fhirFetch (relative to base) or an absolute URL. */
  path: string;
  status: number;
  ts: number;
}

const STORAGE_KEY = "fhir-explorer:request-history";
const MAX_ENTRIES = 25;
const CHANGE_EVENT = "fhir-explorer:history-change";

export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isSameRequest(
  a: Pick<HistoryEntry, "method" | "path">,
  b: Pick<HistoryEntry, "method" | "path">,
) {
  return a.method === b.method && a.path === b.path;
}

function saveHistory(list: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage full/unavailable — history is best-effort */
  }
}

export function recordRequest(entry: Omit<HistoryEntry, "ts">) {
  if (typeof window === "undefined") return;

  const history = getHistory();
  const latest = history[0];
  // Collapse consecutive repeats so paging through a search doesn't fill the whole list.
  if (latest && isSameRequest(latest, entry)) history.shift();

  const updated = [{ ...entry, ts: Date.now() }, ...history].slice(0, MAX_ENTRIES);
  saveHistory(updated);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onHistoryChange(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}
