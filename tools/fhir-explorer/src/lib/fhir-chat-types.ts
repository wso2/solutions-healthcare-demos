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

import type { ChatStatus, UIMessage } from "ai";

export interface FhirChatMessageMetadata {
  elapsedMs: number;
  fhirCalls: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type FhirChatMessage = UIMessage<FhirChatMessageMetadata>;

export interface ChatComposerProps {
  compact: boolean;
  input: string;
  busy: boolean;
  status: ChatStatus;
  onInputChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop: () => void;
  // A rate limit or budget notice is active: block typing + Send and dim the
  // composer. blockedLabel is the short reason shown as the placeholder (the
  // aria-live notice above stays the accessible source of truth).
  sendDisabled?: boolean;
  blockedLabel?: string;
}
