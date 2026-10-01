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

"use client";

import { useEffect, useState } from "react";

interface PolledState<T> {
  url: string;
  payload: T;
}

export interface PolledResource<T> {
  data: T | null;
  loaded: boolean;
  error: boolean;
}

// Polls url every intervalMs while url is non-null. A degraded payload (error flag from degradedResponse) or a failed fetch keeps the last good payload rather than replacing it with fabricated emptiness. keepAcrossUrls keeps data/loaded when url changes (the home polls survive a patient visit); otherwise a new url reads as empty and not-yet-loaded until its first poll lands, matching a patient switch.
export function usePolledResource<T extends { error?: boolean }>(
  url: string | null,
  intervalMs: number,
  keepAcrossUrls = false,
): PolledResource<T> {
  const [state, setState] = useState<PolledState<T> | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(url!);
        const payload = (await response.json()) as T;
        if (!cancelled) {
          setError(payload.error === true);
          if (!payload.error) setState({ url: url!, payload });
        }
      } catch (pollError) {
        console.error(`failed to poll ${url}`, pollError);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoadedUrl(url);
      }
    }

    poll();
    const interval = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [url, intervalMs]);

  const visible = keepAcrossUrls || state?.url === url ? state : null;
  return {
    data: visible?.payload ?? null,
    loaded: keepAcrossUrls ? loadedUrl !== null : loadedUrl === url,
    error,
  };
}
