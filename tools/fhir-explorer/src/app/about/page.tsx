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

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DemoNotice } from "@/components/DemoNotice";
import { DEFAULT_BASE_URL, fhirFetch } from "@/lib/fhir-client";

interface ServerDetails {
  software?: { name?: string; version?: string };
  fhirVersion?: string;
}

export default function AboutPage() {
  const [details, setDetails] = useState<ServerDetails | null>(null);

  useEffect(() => {
    fhirFetch("/metadata", {}, DEFAULT_BASE_URL)
      .then((res) => setDetails((res.body ?? {}) as ServerDetails))
      .catch(() => undefined);
  }, []);

  const software = [details?.software?.name, details?.software?.version].filter(Boolean).join(" ");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Image src="/icons/fhir-server.svg" alt="" width={32} height={32} priority />
          <span className="text-lg font-semibold">About this demo</span>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Explorer
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <DemoNotice />

        <section className="overflow-hidden rounded-xl border bg-card">
          <h2 className="border-b px-5 py-3 text-sm font-medium">Server</h2>
          <dl className="divide-y text-sm">
            {software && <Row label="Software">{software}</Row>}
            {details?.fhirVersion && <Row label="FHIR version">{details.fhirVersion}</Row>}
            <Row label="FHIR Base">
              <span className="font-mono text-xs">{DEFAULT_BASE_URL}</span>
            </Row>
          </dl>
        </section>
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center">
      <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
