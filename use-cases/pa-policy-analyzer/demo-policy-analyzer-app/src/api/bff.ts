const BFF_BASE = window.config?.BFF_BASE || 'http://localhost:6091/v1';

export async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BFF_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`BFF error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

/** Build a BFF proxy URL for fetching a Binary resource by ID. */
export function documentProxyUrl(cernerUrl: string): string {
  // Extract the Binary resource ID from the full Cerner URL
  // e.g. "https://fhir-ehr-code.cerner.com/r4/.../Binary/XR-206142019" → "XR-206142019"
  const parts = cernerUrl.split('/');
  const binaryIdx = parts.indexOf('Binary');
  const id = binaryIdx >= 0 && binaryIdx < parts.length - 1 ? parts[binaryIdx + 1] : parts[parts.length - 1];
  const url = new URL(`${BFF_BASE}/documentProxy`, window.location.origin);
  url.searchParams.set('id', id);
  return url.toString();
}

/**
 * Fetch a FHIR Binary resource via the BFF proxy, decode the base64 data,
 * and return a blob object URL suitable for <iframe src>.
 */
export async function fetchBinaryBlobUrl(resourceId: string): Promise<string> {
  const url = `${BFF_BASE}/documentProxy?id=${encodeURIComponent(resourceId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch binary resource: ${res.status}`);
  const json = await res.json();
  const raw = atob(json.data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const blob = new Blob([bytes], { type: json.contentType });
  return URL.createObjectURL(blob);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BFF_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`BFF error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}
