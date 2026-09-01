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

/**
 * Minimal in-memory sliding-window rate limiter for single-instance deployments.
 * Not distributed — a multi-replica deployment needs a shared store instead.
 */

const requestLog = new Map<string, number[]>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (requestLog.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= limit) {
    requestLog.set(key, recent);
    return true;
  }

  recent.push(now);
  requestLog.set(key, recent);

  // Opportunistic cleanup so the map doesn't grow unbounded with one-off keys.
  if (requestLog.size > 10_000) {
    for (const [k, times] of requestLog) {
      if (times.every((t) => t <= cutoff)) requestLog.delete(k);
    }
  }

  return false;
}

/**
 * Client key for rate limiting: the reverse proxy's X-Real-IP, which (unlike the first
 * X-Forwarded-For hop) the client cannot forge — nginx overwrites it from $remote_addr.
 * Without the nginx front end everyone shares the "unknown" bucket, which fails closed.
 */
export function clientKey(request: Request): string {
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
