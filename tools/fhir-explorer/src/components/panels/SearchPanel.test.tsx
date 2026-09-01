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
import { SearchPanel } from "./SearchPanel";
import * as client from "@/lib/fhir-client";

vi.mock("@/lib/fhir-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fhir-client")>();
  return { ...actual, fhirFetch: vi.fn() };
});

const BASE = "https://example.org/fhir/r4";

function okBundle() {
  return {
    status: 200,
    ok: true,
    headers: {},
    body: { resourceType: "Bundle", entry: [], total: 0 },
    raw: "{}",
    url: `${BASE}/Patient`,
    method: "GET",
    durationMs: 1,
  };
}

beforeEach(() => {
  vi.mocked(client.fhirFetch).mockResolvedValue(okBundle());
});

describe("SearchPanel", () => {
  it("starts on Patient with a default _count=10 parameter", () => {
    renderWithProviders(<SearchPanel baseUrl={BASE} />);
    expect(screen.getByRole("combobox", { name: /resource type/i })).toHaveTextContent("Patient");
    expect(screen.getByRole("combobox", { name: /search parameter name/i })).toHaveTextContent(
      "_count",
    );
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
  });

  it("issues a GET search with the built query string", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchPanel baseUrl={BASE} />);
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(client.fhirFetch).toHaveBeenCalledWith("/Patient?_count=10", {}, BASE);
  });

  it("adds and removes parameter rows", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchPanel baseUrl={BASE} />);
    const paramNameBoxes = () =>
      screen.getAllByRole("combobox", { name: /search parameter name/i });
    expect(paramNameBoxes()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /add parameter/i }));
    expect(paramNameBoxes()).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: /remove parameter/i })[0]);
    expect(paramNameBoxes()).toHaveLength(1);
  });

  it("reflects a resource type chosen from the combobox in the request path", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchPanel baseUrl={BASE} />);
    await user.click(screen.getByRole("combobox", { name: /resource type/i }));
    await user.type(screen.getByPlaceholderText(/search resource type/i), "Observation");
    await user.click(screen.getByRole("option", { name: "Observation" }));
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(client.fhirFetch).toHaveBeenCalledWith("/Observation?_count=10", {}, BASE);
  });

  it("lets you pick a curated search parameter and includes it in the request", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchPanel baseUrl={BASE} />);
    await user.click(screen.getByRole("button", { name: /add parameter/i }));

    const nameBoxes = screen.getAllByRole("combobox", { name: /search parameter name/i });
    await user.click(nameBoxes[1]);
    await user.type(screen.getByPlaceholderText(/search patient parameters/i), "gender");
    await user.click(screen.getByRole("option", { name: /gender/i }));

    const valueInputs = screen.getAllByRole("textbox", { name: /parameter value/i });
    await user.type(valueInputs[1], "female");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(client.fhirFetch).toHaveBeenCalledWith("/Patient?_count=10&gender=female", {}, BASE);
  });

  it("submits the search when Enter is pressed in a value field", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchPanel baseUrl={BASE} />);
    const value = screen.getByRole("textbox", { name: /parameter value/i });
    await user.clear(value);
    await user.type(value, "5{Enter}");
    expect(client.fhirFetch).toHaveBeenCalledWith("/Patient?_count=5", {}, BASE);
  });

  it("renders result rows with summaries and expands a resource on click", async () => {
    vi.mocked(client.fhirFetch).mockResolvedValue({
      ...okBundle(),
      body: {
        resourceType: "Bundle",
        total: 2,
        entry: [
          {
            resource: {
              resourceType: "Patient",
              id: "p1",
              name: [{ given: ["Alice"], family: "Smith" }],
            },
          },
          { resource: { resourceType: "Observation", id: "o1", code: { text: "Heart rate" } } },
        ],
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<SearchPanel baseUrl={BASE} />);
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    // ^-anchored so it matches the expand button, not the "Copy reference …" button.
    const row = await screen.findByRole("button", { name: /^Patient\/p1/ });
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Observation\/o1/ })).toBeInTheDocument();
    expect(screen.getByText("Heart rate")).toBeInTheDocument();

    // Rows start collapsed; expanding adds a highlighted CodeBlock dump, where Prism renders the id as its own `"p1"` string token.
    expect(row).toHaveAttribute("aria-expanded", "false");
    const before = screen.queryAllByText('"p1"').length;
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText('"p1"').length).toBe(before + 1);
  });

  it("copies a result's bare id without expanding the row", async () => {
    vi.mocked(client.fhirFetch).mockResolvedValue({
      ...okBundle(),
      body: {
        resourceType: "Bundle",
        entry: [{ resource: { resourceType: "Patient", id: "p1" } }],
      },
    });
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<SearchPanel baseUrl={BASE} />);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await user.click(screen.getByRole("button", { name: /^search$/i }));
    const copyBtn = await screen.findByRole("button", { name: /copy id p1/i });
    await user.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith("p1");
    // copying must not toggle the row open
    expect(screen.getByRole("button", { name: /^Patient\/p1/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
