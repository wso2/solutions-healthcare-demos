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

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles.css";

// The CSP nonce is per-request, so pages must render dynamically for Next to
// stamp it onto the inline hydration scripts (a static page can't carry a nonce).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FHIR Explorer — Browse any FHIR R4 server",
  description:
    "Interactive UI for exploring FHIR R4 servers with a read-only AI assistant powered by the WSO2 FHIR MCP Server.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
