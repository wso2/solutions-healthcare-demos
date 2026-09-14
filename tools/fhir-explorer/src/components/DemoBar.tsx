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

export function DemoBar() {
  return (
    <div className="border-b border-amber-500/20 bg-amber-50/60 dark:border-amber-400/20 dark:bg-amber-950/25">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
        <TriangleAlert className="size-3.5 shrink-0" />
        <p className="min-w-0 truncate">
          Demo server, not for production — do not enter real patient data.
        </p>
        <Link
          href="/about"
          className="ml-auto shrink-0 font-medium underline underline-offset-2 hover:no-underline"
        >
          Learn more
        </Link>
      </div>
    </div>
  );
}
