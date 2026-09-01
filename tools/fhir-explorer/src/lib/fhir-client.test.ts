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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fhirFetch,
  getBaseUrl,
  setBaseUrl,
  isValidBaseUrl,
  encodeFhirPathSegment,
  DEFAULT_BASE_URL,
} from "./fhir-client";

/**
 * Characterization tests for the FHIR HTTP client. These pin down the URL- and
 * header-building behaviour that every panel relies on, so later UX refactors
 * can't silently change how requests are formed.
 */

function mockFetchOnce(body: string, init?: ResponseInit) {
  const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(body, init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fhirFetch URL building", () => {
  it("joins a relative path onto the base override", async () => {
    const fetchMock = mockFetchOnce("{}", { status: 200 });
    await fhirFetch("/Patient", {}, "https://example.org/fhir/r4");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/fhir?url=https%3A%2F%2Fexample.org%2Ffhir%2Fr4%2FPatient",
    );
  });

  it("strips a trailing slash from the base before joining", async () => {
    const fetchMock = mockFetchOnce("{}");
    await fhirFetch("/Patient", {}, "https://example.org/fhir/r4/");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/fhir?url=https%3A%2F%2Fexample.org%2Ffhir%2Fr4%2FPatient",
    );
  });

  it("adds a leading slash when the path is missing one", async () => {
    const fetchMock = mockFetchOnce("{}");
    await fhirFetch("Patient", {}, "https://example.org/fhir/r4");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/fhir?url=https%3A%2F%2Fexample.org%2Ffhir%2Fr4%2FPatient",
    );
  });

  it("uses an absolute http(s) path verbatim (for follow-link / paging)", async () => {
    const fetchMock = mockFetchOnce("{}");
    await fhirFetch("https://other.example/fhir/Patient?page=2", {}, "https://example.org/fhir/r4");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/fhir?url=https%3A%2F%2Fother.example%2Ffhir%2FPatient%3Fpage%3D2",
    );
  });
});

describe("fhirFetch headers", () => {
  it("defaults Accept to application/fhir+json", async () => {
    const fetchMock = mockFetchOnce("{}");
    await fhirFetch("/Patient", {}, "https://example.org/fhir/r4");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).get("Accept")).toBe("application/fhir+json");
  });

  it("sets a JSON Content-Type when a body is present", async () => {
    const fetchMock = mockFetchOnce("{}");
    await fhirFetch("/Patient", { method: "POST", body: "{}" }, "https://example.org/fhir/r4");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).get("Content-Type")).toBe("application/fhir+json");
  });

  it("does not override a caller-supplied Content-Type", async () => {
    const fetchMock = mockFetchOnce("{}");
    await fhirFetch(
      "/Patient/_search",
      {
        method: "POST",
        body: "name=x",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
      "https://example.org/fhir/r4",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).get("Content-Type")).toBe("application/x-www-form-urlencoded");
  });
});

describe("fhirFetch response shape", () => {
  it("parses a JSON body and reports ok/status/method", async () => {
    mockFetchOnce(JSON.stringify({ resourceType: "Patient", id: "1" }), { status: 200 });
    const res = await fhirFetch("/Patient/1", {}, "https://example.org/fhir/r4");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.method).toBe("GET");
    expect(res.body).toEqual({ resourceType: "Patient", id: "1" });
    expect(typeof res.durationMs).toBe("number");
  });

  it("falls back to the raw string when the body is not JSON", async () => {
    mockFetchOnce("not json", { status: 500 });
    const res = await fhirFetch("/Patient/1", {}, "https://example.org/fhir/r4");
    expect(res.ok).toBe(false);
    expect(res.body).toBe("not json");
    expect(res.raw).toBe("not json");
  });
});

describe("base URL persistence", () => {
  beforeEach(() => localStorage.clear());

  it("falls back to DEFAULT_BASE_URL when nothing is stored", () => {
    expect(getBaseUrl()).toBe(DEFAULT_BASE_URL);
  });

  it("round-trips a stored base URL and strips its trailing slash", () => {
    setBaseUrl("https://example.org/fhir/r4/");
    expect(getBaseUrl()).toBe("https://example.org/fhir/r4");
  });
});

describe("isValidBaseUrl", () => {
  it("accepts same-origin relative paths and http(s) URLs", () => {
    expect(isValidBaseUrl("/fhir/r4")).toBe(true);
    expect(isValidBaseUrl("https://example.org/fhir/r4")).toBe(true);
    expect(isValidBaseUrl("http://localhost:9090/fhir/r4")).toBe(true);
  });

  it("rejects dangerous schemes, protocol-relative, and empty values", () => {
    expect(isValidBaseUrl("javascript:alert(1)")).toBe(false);
    expect(isValidBaseUrl("data:text/html,<script>1</script>")).toBe(false);
    expect(isValidBaseUrl("file:///etc/passwd")).toBe(false);
    expect(isValidBaseUrl("ftp://example.org")).toBe(false);
    expect(isValidBaseUrl("//evil.example")).toBe(false);
    expect(isValidBaseUrl("")).toBe(false);
  });
});

describe("setBaseUrl validation", () => {
  beforeEach(() => localStorage.clear());

  it("stores nothing and returns false for an invalid URL", () => {
    expect(setBaseUrl("javascript:alert(1)")).toBe(false);
    expect(getBaseUrl()).toBe(DEFAULT_BASE_URL);
  });

  it("stores and returns true for a valid URL", () => {
    expect(setBaseUrl("https://example.org/fhir/r4")).toBe(true);
    expect(getBaseUrl()).toBe("https://example.org/fhir/r4");
  });
});

describe("encodeFhirPathSegment", () => {
  it("leaves normal FHIR types/ids unchanged", () => {
    expect(encodeFhirPathSegment("Patient")).toBe("Patient");
    expect(encodeFhirPathSegment("abc-123")).toBe("abc-123");
  });
  it("escapes characters that could break out of a path segment", () => {
    expect(encodeFhirPathSegment("../Secret")).toBe("..%2FSecret");
    expect(encodeFhirPathSegment("1?x=y")).toBe("1%3Fx%3Dy");
    expect(encodeFhirPathSegment("a#b")).toBe("a%23b");
  });
});

describe("fhirFetch scheme guard", () => {
  it("refuses to dereference non-HTTP(S) URLs", async () => {
    await expect(
      fhirFetch("javascript:alert(1)", {}, "https://example.org/fhir/r4"),
    ).rejects.toThrow(/non-HTTP/i);
    await expect(fhirFetch("data:text/html,x", {}, "https://example.org/fhir/r4")).rejects.toThrow(
      /non-HTTP/i,
    );
  });

  it("still allows absolute http(s) follow-link URLs", async () => {
    const fetchMock = mockFetchOnce("{}");
    await fhirFetch("https://other.example/fhir/Patient?page=2", {}, "https://example.org/fhir/r4");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/fhir?url=https%3A%2F%2Fother.example%2Ffhir%2FPatient%3Fpage%3D2",
    );
  });
});
