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
import { TriangleAlert } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="border-b border-amber-500/40 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 text-center text-xs sm:text-[13px]">
        <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-balance">
          <span className="font-semibold">Demo server, not for production.</span> Do not enter real
          patient data — everything here is public and reset weekly.{" "}
          <Link
            href="/about"
            className="font-semibold underline underline-offset-4 hover:no-underline"
          >
            Read the notice
          </Link>
        </p>
      </div>
    </div>
  );
}
