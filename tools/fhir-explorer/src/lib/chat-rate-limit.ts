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

// The two throttles a chat user can hit reach the client through different
// channels and mean opposite things:
//   - per-minute rate limit  → transient; the nginx/app 429 (+ Retry-After) is
//     the HTTP response, surfaced client-side by the transport fetch wrapper.
//   - weekly LLM spend budget → persistent for the window; the AI gateway 429
//     happens mid-stream, surfaced through the stream's onError as an encoded
//     string. This module normalizes both into one ChatLimit.

export type ChatLimit =
  | { kind: "per-minute"; retryAfterSec: number }
  | { kind: "weekly-budget"; resetAt: string | null }
  // The AI gateway's content guardrail refused the request (HTTP 422). Not a
  // throttle and not an app failure — the query itself was out of scope.
  | { kind: "blocked" };

// Thrown by the transport fetch wrapper when the HTTP response is a 429.
export class ChatRateLimitError extends Error {
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super("Too many requests. Try again shortly.");
    this.name = "ChatRateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

// The server encodes the budget case into the stream error string (which the AI
// SDK surfaces verbatim as the client-side error.message).
const BUDGET_ERROR_PREFIX = "chat-limit:";

export function encodeBudgetError(resetAt: string | null): string {
  return BUDGET_ERROR_PREFIX + JSON.stringify({ resetAt });
}

// The gateway guardrail returns 422; encode it so the UI shows an out-of-scope
// notice rather than the generic failure message.
const BLOCKED_ERROR_PREFIX = "chat-blocked:";

export function encodeBlockedError(): string {
  return BLOCKED_ERROR_PREFIX;
}

// Normalize the gateway's X-RateLimit-Reset header into an ISO timestamp. WSO2's
// advanced-ratelimit emits either a Unix epoch (seconds) or a delta-in-seconds;
// treat small values as a delta from now, large ones as an absolute epoch.
export function resetAtFromHeader(value: string | undefined | null): string | null {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return null;
  const epochMs = n < 1_000_000_000 ? Date.now() + n * 1000 : n * 1000;
  return new Date(epochMs).toISOString();
}

export function parseChatLimit(error: Error | undefined): ChatLimit | null {
  if (!error) return null;
  if (error instanceof ChatRateLimitError) {
    return { kind: "per-minute", retryAfterSec: error.retryAfterSec };
  }
  const message = error.message ?? "";
  if (message.startsWith(BLOCKED_ERROR_PREFIX)) {
    return { kind: "blocked" };
  }
  if (message.startsWith(BUDGET_ERROR_PREFIX)) {
    try {
      const data = JSON.parse(message.slice(BUDGET_ERROR_PREFIX.length)) as { resetAt?: string };
      return { kind: "weekly-budget", resetAt: data.resetAt ?? null };
    } catch {
      // fall through to a generic error
    }
  }
  return null;
}
