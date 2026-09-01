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
import { clientKey, isRateLimited } from "./rate-limit";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/chat", { headers });
}

describe("clientKey", () => {
  it("uses X-Real-IP, which nginx overwrites so the client cannot forge it", () => {
    expect(clientKey(req({ "X-Real-IP": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("ignores the client-forgeable X-Forwarded-For header", () => {
    // nginx appends the real IP to a forged XFF; taking any XFF hop lets a
    // client rotate keys and bypass the limit, so XFF must not be a key source.
    const key = clientKey(
      req({ "X-Forwarded-For": "10.0.0.1, 203.0.113.9", "X-Real-IP": "203.0.113.9" }),
    );
    expect(key).toBe("203.0.113.9");
  });

  it("falls back to a shared bucket without the reverse proxy (fails closed)", () => {
    expect(clientKey(req({ "X-Forwarded-For": "10.0.0.1" }))).toBe("unknown");
  });
});

describe("isRateLimited", () => {
  it("cannot be bypassed by rotating forged X-Forwarded-For values", () => {
    const blocked = Array.from({ length: 50 }, (_, i) =>
      isRateLimited(
        clientKey(
          req({ "X-Forwarded-For": `10.0.0.${i}, 203.0.113.9`, "X-Real-IP": "203.0.113.9" }),
        ),
        10,
        60_000,
      ),
    ).filter(Boolean).length;
    expect(blocked).toBe(40);
  });
});
