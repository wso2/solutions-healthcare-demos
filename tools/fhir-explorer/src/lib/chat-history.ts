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

import type { FhirChatMessage } from "@/lib/fhir-chat-types";

/**
 * Drops tool calls and their outputs from the conversation before it is sent to
 * the model. The chips stay in the UI; they just stop being replayed.
 *
 * Every turn resends the whole history, so prior tool payloads would otherwise
 * be re-sent on every later question, growing the prompt without adding signal
 * until it exceeds the model's input window. Assistant turns that produced no
 * text are dropped entirely, since an empty assistant message is invalid.
 */
export function withoutToolParts(messages: FhirChatMessage[]): FhirChatMessage[] {
  const trimmed: FhirChatMessage[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") {
      trimmed.push(message);
      continue;
    }

    const textParts = message.parts.filter((part) => part.type === "text" && part.text.trim());
    if (textParts.length === 0) continue;

    trimmed.push({ ...message, parts: textParts });
  }

  return trimmed;
}
