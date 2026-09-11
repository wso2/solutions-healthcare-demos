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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { OperationsPanel } from "./OperationsPanel";
import { VALIDATE_SAMPLE_BODY } from "@/lib/fhir-operations";
import * as client from "@/lib/fhir-client";

vi.mock("@/lib/fhir-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fhir-client")>();
  return { ...actual, fhirFetch: vi.fn() };
});

const BASE = "https://example.org/fhir/r4";

function okResponse() {
  return {
    status: 200,
    ok: true,
    headers: {},
    body: { resourceType: "Bundle" },
    raw: "{}",
    url: BASE,
    method: "GET",
    durationMs: 1,
  };
}

beforeEach(() => {
  vi.mocked(client.fhirFetch).mockResolvedValue(okResponse());
});

describe("OperationsPanel", () => {
  it("defaults to instance / Patient / $everything and disables Invoke until an id is given", () => {
    renderWithProviders(<OperationsPanel baseUrl={BASE} />);
    expect(screen.getByRole("combobox", { name: /operation/i })).toHaveTextContent("$everything");
    expect(screen.getByRole("button", { name: /invoke/i })).toBeDisabled();
  });

  it("invokes an instance operation as GET with the built path", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OperationsPanel baseUrl={BASE} />);
    await user.type(screen.getByPlaceholderText("resource id"), "123");
    await user.click(screen.getByRole("button", { name: /invoke/i }));
    expect(client.fhirFetch).toHaveBeenCalledWith("/Patient/123/$everything", {}, BASE);
  });

  it("appends filled primitive parameters to the GET query string", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OperationsPanel baseUrl={BASE} />);
    await user.type(screen.getByPlaceholderText("resource id"), "123");
    // Pick the _count parameter in the row's name combobox (Search-style UX).
    await user.click(screen.getByRole("combobox", { name: /parameter name/i }));
    await user.type(screen.getByPlaceholderText(/search parameters/i), "_count");
    await user.click(screen.getByRole("option", { name: /_count/i }));
    await user.type(screen.getByRole("textbox", { name: /parameter value/i }), "10");
    await user.click(screen.getByRole("button", { name: /invoke/i }));
    expect(client.fhirFetch).toHaveBeenCalledWith("/Patient/123/$everything?_count=10", {}, BASE);
  });

  it("forces POST for $validate and sends the default Patient body", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OperationsPanel baseUrl={BASE} />);

    await user.click(screen.getByRole("radio", { name: /^Type/ }));
    await user.click(screen.getByRole("combobox", { name: /operation/i }));
    await user.type(screen.getByPlaceholderText(/search operations/i), "validate");
    await user.click(screen.getByRole("option", { name: /resource is valid/i }));

    expect(screen.getByRole("radio", { name: "POST" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "GET" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /invoke/i }));

    expect(client.fhirFetch).toHaveBeenCalledWith(
      "/Patient/$validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/fhir+json" },
        body: VALIDATE_SAMPLE_BODY,
      },
      BASE,
    );
  });

  it("disables POST for $meta (GET-only)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OperationsPanel baseUrl={BASE} />);

    await user.click(screen.getByRole("radio", { name: /^Type/ }));
    await user.click(screen.getByRole("combobox", { name: /operation/i }));
    await user.type(screen.getByPlaceholderText(/search operations/i), "meta");
    await user.click(screen.getByRole("option", { name: /tags, security labels/i }));

    expect(screen.getByRole("radio", { name: "GET" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "POST" })).toBeDisabled();
  });

  it("does not list $export or $match", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OperationsPanel baseUrl={BASE} />);

    await user.click(screen.getByRole("radio", { name: /^Type/ }));
    await user.click(screen.getByRole("combobox", { name: /operation/i }));
    const search = screen.getByPlaceholderText(/search operations/i);

    await user.type(search, "export");
    expect(screen.queryByRole("option", { name: /\$export/i })).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "match");
    expect(screen.queryByRole("option", { name: /\$match/i })).not.toBeInTheDocument();
  });

  it("offers only type and instance scopes", () => {
    renderWithProviders(<OperationsPanel baseUrl={BASE} />);
    expect(screen.queryByRole("radio", { name: /^System/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Type/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Instance/ })).toBeInTheDocument();
  });
});
