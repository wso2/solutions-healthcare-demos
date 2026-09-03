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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchParamCombobox } from "./SearchParamCombobox";

// Deterministic params so the test doesn't depend on a capability fetch.
vi.mock("@/hooks/use-resource-search-params", () => ({
  useResourceSearchParams: () => ({
    params: [
      { name: "family", type: "string", documentation: "Family/last name" },
      { name: "gender", type: "token", documentation: "male | female | other | unknown" },
      { name: "_count", type: "number", documentation: "Page size" },
      { name: "_id", type: "token", documentation: "Logical id" },
    ],
    byName: new Map(),
  }),
}));

function setup(value = "") {
  const onChange = vi.fn();
  render(
    <SearchParamCombobox
      resourceType="Patient"
      baseUrl="http://x"
      value={value}
      onChange={onChange}
    />,
  );
  return { onChange, user: userEvent.setup() };
}

describe("SearchParamCombobox", () => {
  it("shows a placeholder when empty and the value when set", () => {
    const { user: _u } = setup("");
    expect(screen.getByRole("combobox", { name: /search parameter name/i })).toHaveTextContent(
      /parameter/i,
    );
  });

  it("groups resource-specific params separately from result/meta params", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("Patient parameters")).toBeInTheDocument();
    expect(screen.getByText("Result & meta parameters")).toBeInTheDocument();
  });

  it("renders parameter type badges", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("string")).toBeInTheDocument();
  });

  it("filters and selects a parameter", async () => {
    const onChange = vi.fn();
    render(
      <SearchParamCombobox
        resourceType="Patient"
        baseUrl="http://x"
        value=""
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText(/search patient parameters/i), "gender");
    await user.click(screen.getByRole("option", { name: /gender/i }));
    expect(onChange).toHaveBeenCalledWith("gender");
  });

  it("allows an arbitrary/custom parameter name", async () => {
    const onChange = vi.fn();
    render(
      <SearchParamCombobox
        resourceType="Patient"
        baseUrl="http://x"
        value=""
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText(/search patient parameters/i), "custom-x");
    await user.click(screen.getByRole("button", { name: /use .*custom-x/i }));
    expect(onChange).toHaveBeenCalledWith("custom-x");
  });
});
