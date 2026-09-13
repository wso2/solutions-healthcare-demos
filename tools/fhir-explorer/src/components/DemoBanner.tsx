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

export function DemoBanner() {
  return (
    <div className="border-b bg-muted/50">
      <p className="mx-auto max-w-7xl px-4 py-1.5 text-center text-[11px] text-muted-foreground">
        <span className="mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-amber-500" />
        Demo server, not for production — do not enter real patient data.{" "}
        <Link href="/about" className="underline underline-offset-2 hover:text-foreground">
          Learn more
        </Link>
      </p>
    </div>
  );
}
