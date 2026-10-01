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

"use client";

import { useEffect, useState } from "react";

export function AppHeader({ lastPollAt }: { lastPollAt: number | null }) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  const displayed = lastPollAt ?? now;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] bg-white px-6">
      <div className="flex items-center gap-3">
        {/* Mock's exact loop-with-pulse logo mark. */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#16161a"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          aria-hidden="true"
        >
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 3v4h-4" />
          <path d="M8.5 12h2l1-2.4 1.6 4.4 1-2h1.9" />
        </svg>
        <span className="text-[15px] font-bold tracking-[-0.2px]">Care Loop</span>
      </div>
      <span className="font-mono text-[11px] text-[rgba(0,0,0,0.45)]">
        last update {new Date(displayed).toLocaleTimeString([], { hour12: false })}
      </span>
    </header>
  );
}
