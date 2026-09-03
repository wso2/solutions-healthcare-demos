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

import type { ChatStatus } from "ai";
import type { FhirChatMessage } from "@/lib/fhir-chat-types";

interface FhirToolInput {
  type?: string;
  resourceType?: string;
  id?: string;
}

interface FhirToolPart {
  type: string;
  toolName?: string;
  input?: FhirToolInput;
}

/** MCP-provided tools stream as "dynamic-tool" parts; statically-typed tools as "tool-<name>". */
export function isToolPart(part: { type: string }): boolean {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

export function followUpSuggestions(messages: FhirChatMessage[]): string[] {
  let lastAssistant: FhirChatMessage | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== "assistant") continue;
    lastAssistant = messages[index];
    break;
  }

  const resourceTypes = new Set<string>();
  for (const part of lastAssistant?.parts ?? []) {
    if (!isToolPart(part)) continue;
    const input = (part as FhirToolPart).input;
    const resourceType = input?.type ?? input?.resourceType;
    if (resourceType) resourceTypes.add(resourceType);
  }

  const resourceType = resourceTypes.values().next().value;
  if (!resourceType) {
    return [
      "Which Patient search filters are available?",
      "Show five recently updated Observations.",
    ];
  }

  return [
    `Show five recently updated ${resourceType} resources.`,
    `Which ${resourceType} search filters are available?`,
  ];
}

export function describeTool(part: FhirChatMessage["parts"][number]): string {
  const toolPart = part as FhirToolPart;
  const toolName = toolPart.toolName ?? toolPart.type.replace(/^tool-/, "");
  const resourceType = toolPart.input?.type ?? toolPart.input?.resourceType;

  if (toolName === "get_capabilities") {
    return resourceType ? `Checking ${resourceType} capabilities` : "Checking FHIR capabilities";
  }
  if (toolName === "search") {
    return resourceType ? `Searching ${resourceType} resources` : "Searching FHIR resources";
  }
  if (toolName !== "read") return "Querying the FHIR server";

  const target = [resourceType, toolPart.input?.id].filter(Boolean).join("/");
  return target ? `Reading ${target}` : "Reading a FHIR resource";
}

export function currentActivity(
  messages: FhirChatMessage[],
  status: ChatStatus,
): string | undefined {
  if (status === "submitted") return "Thinking";
  if (status !== "streaming") return undefined;

  const lastMessage = messages.at(-1);
  if (lastMessage?.role !== "assistant") return "Preparing FHIR request";

  for (let index = lastMessage.parts.length - 1; index >= 0; index -= 1) {
    const part = lastMessage.parts[index];
    if (!part) continue;
    if (part.type === "text" && part.text.trim()) return "Writing response";
    if (!isToolPart(part)) continue;

    const state = "state" in part ? part.state : undefined;
    return state === "output-available" ? "Reviewing FHIR results" : describeTool(part);
  }

  return "Thinking";
}
