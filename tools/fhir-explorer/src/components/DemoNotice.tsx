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

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const HEALTHCARE_URL = "https://wso2.com/solutions/healthcare/";
export const FHIR_SERVER_URL = "https://github.com/wso2/fhir-server";
export const CONTACT_URL = "https://wso2.com/contact/?ref=Healthcare";

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-foreground underline decoration-primary/40 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
    >
      {children}
    </a>
  );
}

export function DemoIntro() {
  return (
    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
      You are accessing the <TextLink href={HEALTHCARE_URL}>WSO2 Open Healthcare</TextLink> FHIR
      Explorer demo site, connected to a public demo{" "}
      <TextLink href={FHIR_SERVER_URL}>WSO2 FHIR server</TextLink> (R4). This server is provided for
      evaluation and testing of the WSO2 FHIR server.
    </p>
  );
}

export function DemoWarning() {
  return (
    <section className="border-l-2 border-destructive pl-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-destructive">
        Not for production use
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Do not create, upload, or store any information containing personal health information,
        patient identifiers, or other confidential data. All resources on this server are publicly
        readable and writable by anyone.
      </p>
    </section>
  );
}

export function DemoDetails() {
  return (
    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
      The server is reset weekly and reloaded with a fixed set of synthetic test data, so anything
      you create here will be removed without notice. Capacity is limited, so requests may take a
      few moments. Rate limits are enforced to protect the server from abuse and to keep it
      responsive for everyone; if your requests are throttled, wait a moment before retrying.
    </p>
  );
}

export function DemoCta() {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-sm text-muted-foreground">
        Running this in production? WSO2 offers supported, hosted deployments of Open Healthcare.
      </p>
      <Button asChild size="sm">
        <a href={CONTACT_URL} target="_blank" rel="noreferrer">
          Talk to us
          <ArrowRight />
        </a>
      </Button>
    </section>
  );
}

export function DemoNotice() {
  return (
    <div className="space-y-8">
      <DemoIntro />
      <DemoWarning />
      <DemoDetails />
      <DemoCta />
    </div>
  );
}
