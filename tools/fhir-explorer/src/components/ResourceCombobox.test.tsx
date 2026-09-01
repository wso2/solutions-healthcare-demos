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

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { ResourceCombobox } from "./ResourceCombobox";

// Deterministic, synchronous "supported" list so we don't depend on a network
// round-trip for the capability statement.
vi.mock("@/hooks/use-capabilities", () => ({
  useSupportedResourceTypes: () => ["Observation", "Patient"],
}));

describe("ResourceCombobox", () => {
  it("shows the selected value on the trigger", () => {
    renderWithProviders(<ResourceCombobox value="Patient" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Patient");
  });

  it("shows the placeholder when nothing is selected", () => {
    renderWithProviders(<ResourceCombobox value="" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent(/select resource type/i);
  });

  it("surfaces server-supported resources first, then the full catalogue", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResourceCombobox value="" onChange={() => {}} />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("Supported by this server")).toBeInTheDocument();
    expect(screen.getByText("All FHIR R4 resources")).toBeInTheDocument();
  });

  it("filters as you type and selects an option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<ResourceCombobox value="" onChange={onChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText(/search resource type/i), "Encounter");
    await user.click(screen.getByRole("option", { name: "Encounter" }));
    expect(onChange).toHaveBeenCalledWith("Encounter");
  });

  it("allows entering an arbitrary/custom resource type", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<ResourceCombobox value="" onChange={onChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText(/search resource type/i), "CustomThing");
    await user.click(screen.getByRole("button", { name: /use .*CustomThing/i }));
    expect(onChange).toHaveBeenCalledWith("CustomThing");
  });
});
