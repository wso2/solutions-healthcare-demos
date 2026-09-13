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

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Github, Info } from "lucide-react";
import { RequestHistoryMenu } from "./RequestHistoryMenu";

export function BaseUrlBar() {
  return (
    <div className="border-b bg-card">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 pr-1">
            <Image src="/icons/fhir-server.svg" alt="" width={36} height={36} priority />
            <div>
              <span className="text-xl font-semibold">FHIR Explorer</span>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span>Powered by</span>
                <a
                  href="https://github.com/wso2/fhir-mcp-server"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-foreground/75 hover:text-primary hover:underline"
                >
                  WSO2 FHIR Server
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/about"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Info className="size-4" />
              About
            </Link>
            <a
              href="https://github.com/wso2/fhir-server"
              target="_blank"
              rel="noreferrer"
              aria-label="WSO2 FHIR Server on GitHub"
              title="WSO2 FHIR Server on GitHub"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Github className="size-5" />
            </a>
            <RequestHistoryMenu />
          </div>
        </div>
      </div>
    </div>
  );
}
