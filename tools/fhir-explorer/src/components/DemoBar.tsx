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

import Link from "next/link";

export function DemoBar() {
  return (
    <div className="border-b bg-card">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
          Not for production
        </span>
        <span aria-hidden className="h-3.5 w-px shrink-0 bg-border" />
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          Public demo server — do not enter real patient data.
        </p>
        <Link
          href="/about"
          className="ml-auto shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          About this demo
        </Link>
      </div>
    </div>
  );
}
