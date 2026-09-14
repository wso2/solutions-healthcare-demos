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
    <div className="border-b border-white/10 bg-zinc-900 text-zinc-300">
      <div className="mx-auto flex max-w-7xl items-center gap-2.5 px-4 py-1.5 text-[11px]">
        <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />
        <p className="min-w-0 truncate">
          <span className="font-medium text-zinc-100">Demo server</span> — not for production. Do
          not enter real patient data.
        </p>
        <Link
          href="/about"
          className="ml-auto shrink-0 font-medium text-zinc-100 underline underline-offset-2 hover:text-white hover:no-underline"
        >
          Learn more
        </Link>
      </div>
    </div>
  );
}
