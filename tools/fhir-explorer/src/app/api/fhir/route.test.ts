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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearMetadataCache } from "@/lib/server/metadata-cache";

import { GET, POST } from "./route";

const TARGET_URL = "http://localhost:9090/fhir/r4/Patient";

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubEnv("FHIR_SERVER_BASE_URL", "http://fhir-server:9090/fhir/r4");
  clearMetadataCache();
});

describe("FHIR proxy", () => {
  it("forwards the target request without browser or reverse-proxy headers", async () => {
    const upstreamFetch = vi.fn(async (..._args: Parameters<typeof fetch>) => {
      return new Response('{"resourceType":"Bundle"}', {
        headers: {
          "Content-Type": "application/fhir+json",
          "Set-Cookie": "session=upstream",
        },
      });
    });
    vi.stubGlobal("fetch", upstreamFetch);

    const request = new Request(`http://localhost/api/fhir?url=${encodeURIComponent(TARGET_URL)}`, {
      headers: {
        Accept: "application/fhir+json",
        Authorization: "Bearer test-token",
        Cookie: "explorer=session",
        "X-Forwarded-For": "192.0.2.10",
      },
    });

    const response = await GET(request);
    const [url, init] = upstreamFetch.mock.calls[0];
    const headers = new Headers(init?.headers);

    expect(url).toBe("http://fhir-server:9090/fhir/r4/Patient");
    expect(headers.get("accept")).toBe("application/fhir+json");
    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("x-forwarded-for")).toBeNull();
    expect(response.headers.get("content-type")).toBe("application/fhir+json");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("forwards request bodies and methods", async () => {
    const upstreamFetch = vi.fn(
      async (..._args: Parameters<typeof fetch>) => new Response(null, { status: 201 }),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const request = new Request(`http://localhost/api/fhir?url=${encodeURIComponent(TARGET_URL)}`, {
      method: "POST",
      body: '{"resourceType":"Patient"}',
      headers: { "Content-Type": "application/fhir+json" },
    });

    const response = await POST(request);
    const [, init] = upstreamFetch.mock.calls[0];

    expect(init?.method).toBe("POST");
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{"resourceType":"Patient"}');
    expect(response.status).toBe(201);
  });

  it("rejects invalid target URLs before fetching", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await GET(new Request("http://localhost/api/fhir?url=file:///etc/passwd"));

    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("rejects paths outside the configured FHIR server", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);

    for (const url of ["http://localhost:9090/admin", "https://fhir.example.org/baseR4/Patient"]) {
      const response = await GET(
        new Request(`http://localhost/api/fhir?url=${encodeURIComponent(url)}`),
      );
      expect(response.status, url).toBe(400);
    }
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("preserves the path and query while targeting the configured server", async () => {
    const upstreamFetch = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(null));
    vi.stubGlobal("fetch", upstreamFetch);
    const targetUrl = "http://localhost:9090/fhir/r4/ValueSet?url=https://codes.example/";

    await GET(new Request(`http://localhost/api/fhir?url=${encodeURIComponent(targetUrl)}`));

    expect(upstreamFetch.mock.calls[0][0]).toBe(
      "http://fhir-server:9090/fhir/r4/ValueSet?url=https://codes.example/",
    );
  });

  const METADATA_URL = "http://localhost:9090/fhir/r4/metadata";

  function metadataRequest(init?: RequestInit) {
    return new Request(`http://localhost/api/fhir?url=${encodeURIComponent(METADATA_URL)}`, init);
  }

  function capabilityFetch() {
    return vi.fn(
      async () =>
        new Response('{"resourceType":"CapabilityStatement"}', {
          headers: { "Content-Type": "application/fhir+json" },
        }),
    );
  }

  it("serves a repeated capability request from the in-memory cache", async () => {
    const upstreamFetch = capabilityFetch();
    vi.stubGlobal("fetch", upstreamFetch);

    const first = await GET(metadataRequest());
    const second = await GET(metadataRequest());

    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    expect(first.headers.get("cache-control")).toContain("s-maxage=900");
    expect(second.headers.get("cache-control")).toContain("s-maxage=900");
    expect(await second.text()).toBe('{"resourceType":"CapabilityStatement"}');
  });

  it("never caches capability requests that carry authorization", async () => {
    const upstreamFetch = capabilityFetch();
    vi.stubGlobal("fetch", upstreamFetch);

    const first = await GET(metadataRequest({ headers: { Authorization: "Bearer test-token" } }));
    const second = await GET(metadataRequest({ headers: { Authorization: "Bearer test-token" } }));

    expect(upstreamFetch).toHaveBeenCalledTimes(2);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(second.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not cache non-capability reads", async () => {
    const upstreamFetch = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("{}"));
    vi.stubGlobal("fetch", upstreamFetch);
    const request = () =>
      new Request(`http://localhost/api/fhir?url=${encodeURIComponent(TARGET_URL)}`);

    const first = await GET(request());
    await GET(request());

    expect(upstreamFetch).toHaveBeenCalledTimes(2);
    expect(first.headers.get("cache-control")).toBeNull();
  });

  it("refetches the capability after the cache TTL lapses", async () => {
    vi.useFakeTimers();
    try {
      const upstreamFetch = capabilityFetch();
      vi.stubGlobal("fetch", upstreamFetch);

      await GET(metadataRequest());
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
      await GET(metadataRequest());

      expect(upstreamFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
