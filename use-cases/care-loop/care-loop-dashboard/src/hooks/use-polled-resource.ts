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
