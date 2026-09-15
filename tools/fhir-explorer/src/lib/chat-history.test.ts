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

import { describe, expect, it } from "vitest";
import type { FhirChatMessage } from "@/lib/fhir-chat-types";
import { withoutToolParts } from "@/lib/chat-history";

function message(role: "user" | "assistant", parts: unknown[]): FhirChatMessage {
  return { id: `${role}-1`, role, parts } as unknown as FhirChatMessage;
}

describe("withoutToolParts", () => {
  it("keeps user turns and plain assistant text untouched", () => {
    const messages = [
      message("user", [{ type: "text", text: "last 5 encounters?" }]),
      message("assistant", [{ type: "text", text: "Here are 5 encounters." }]),
    ];

    expect(withoutToolParts(messages)).toEqual(messages);
  });

  it("drops tool parts but keeps the assistant text", () => {
    const messages = [
      message("user", [{ type: "text", text: "last 5 encounters?" }]),
      message("assistant", [
        {
          type: "dynamic-tool",
          toolName: "search",
          input: { type: "Encounter" },
          state: "output-available",
          output: { big: "payload" },
        },
        { type: "text", text: "Here are 5 encounters." },
      ]),
    ];

    const result = withoutToolParts(messages);

    expect(result).toHaveLength(2);
    expect(result[1]?.parts).toEqual([{ type: "text", text: "Here are 5 encounters." }]);
  });

  it("drops an assistant turn that produced only tool parts", () => {
    const messages = [
      message("user", [{ type: "text", text: "last 5 encounters?" }]),
      message("assistant", [
        {
          type: "dynamic-tool",
          toolName: "search",
          input: { type: "Encounter" },
          state: "output-available",
          output: { big: "payload" },
        },
      ]),
      message("user", [{ type: "text", text: "try again" }]),
    ];

    const result = withoutToolParts(messages);

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.role)).toEqual(["user", "user"]);
  });

  it("drops whitespace-only assistant text along with the tool parts", () => {
    const messages = [
      message("assistant", [
        {
          type: "dynamic-tool",
          toolName: "search",
          input: {},
          state: "output-available",
          output: {},
        },
        { type: "text", text: "   " },
      ]),
    ];

    expect(withoutToolParts(messages)).toEqual([]);
  });
});
