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

/**
 * In-memory TTL cache for CapabilityStatement responses so the capability tab
 * does not re-query the FHIR server on every load. Single-instance only, like
 * the rate limiter: a multi-replica deployment needs a shared store instead.
 */

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 16;

export interface CachedMetadata {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
  expiresAt: number;
}

const cache = new Map<string, CachedMetadata>();

/** True for the CapabilityStatement endpoint, ignoring a trailing slash. */
export function isCapabilityStatementPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "").endsWith("/metadata");
}

export function readMetadataCache(key: string): CachedMetadata | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }

  return entry;
}

export function writeMetadataCache(key: string, entry: Omit<CachedMetadata, "expiresAt">): void {
  if (!cache.has(key) && cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }

  cache.set(key, { ...entry, expiresAt: Date.now() + TTL_MS });
}

export function clearMetadataCache(): void {
  cache.clear();
}
