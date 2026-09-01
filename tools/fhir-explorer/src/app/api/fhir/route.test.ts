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

import { afterEach, describe, expect, it, vi } from "vitest";

// The SSRF guard DNS-resolves non-allowlisted hostnames; resolve the test host to a public address.
vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
  return { ...actual, default: { ...actual, lookup }, lookup };
});

import { GET, POST } from "./route";

const TARGET_URL = "https://fhir.example.org/r4/Patient";

afterEach(() => {
  vi.unstubAllGlobals();
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

    expect(url).toBe(TARGET_URL);
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

  it("rejects loopback and link-local targets", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);

    for (const url of [
      "http://127.0.0.1:9999/admin",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/admin",
      "http://10.0.0.5/internal",
      "http://[::ffff:127.0.0.1]/admin",
    ]) {
      const response = await GET(
        new Request(`http://localhost/api/fhir?url=${encodeURIComponent(url)}`),
      );
      expect(response.status, url).toBe(400);
    }
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);
    const dns = await import("node:dns/promises");
    vi.mocked(dns.lookup).mockResolvedValueOnce([{ address: "192.168.1.10", family: 4 }] as never);

    const response = await GET(
      new Request(`http://localhost/api/fhir?url=${encodeURIComponent("http://rebind.example/x")}`),
    );

    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("preserves the complete upstream URL", async () => {
    const upstreamFetch = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(null));
    vi.stubGlobal("fetch", upstreamFetch);
    const targetUrl = "https://fhir.example.org/r4/ValueSet?url=https://codes.example/";

    await GET(new Request(`http://localhost/api/fhir?url=${encodeURIComponent(targetUrl)}`));

    expect(upstreamFetch.mock.calls[0][0]).toBe(targetUrl);
  });
});
