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
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { OperationsPanel } from "./OperationsPanel";
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

  it("switches to POST and sends a Parameters body when a resource input is provided", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OperationsPanel baseUrl={BASE} />);

    await user.click(screen.getByRole("radio", { name: /^Type/ }));
    await user.click(screen.getByRole("combobox", { name: /operation/i }));
    await user.type(screen.getByPlaceholderText(/search operations/i), "validate");
    await user.click(screen.getByRole("option", { name: /resource is valid/i }));

    // Pick the `resource` parameter in the row's name combobox.
    await user.click(screen.getByRole("combobox", { name: /parameter name/i }));
    await user.type(screen.getByPlaceholderText(/search parameters/i), "resource");
    await user.click(screen.getByRole("option", { name: /resource to validate/i }));

    // Brace-laden JSON is awkward to type via userEvent, so set it directly.
    const resourceInput = screen.getByRole("textbox", { name: /parameter value/i });
    fireEvent.change(resourceInput, { target: { value: '{"resourceType":"Patient","id":"x"}' } });

    await user.click(screen.getByRole("button", { name: /invoke/i }));

    expect(client.fhirFetch).toHaveBeenCalledWith(
      "/Patient/$validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/fhir+json" },
        body: JSON.stringify(
          {
            resourceType: "Parameters",
            parameter: [{ name: "resource", resource: { resourceType: "Patient", id: "x" } }],
          },
          null,
          2,
        ),
      },
      BASE,
    );
  });

  it("hides the resource-type and id inputs at system scope", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OperationsPanel baseUrl={BASE} />);
    await user.click(screen.getByRole("radio", { name: /^System/ }));
    expect(screen.queryByPlaceholderText("resource id")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /resource type/i })).not.toBeInTheDocument();
  });
});
