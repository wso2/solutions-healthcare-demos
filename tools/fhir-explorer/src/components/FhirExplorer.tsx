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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BaseUrlBar, useBaseUrl } from "@/components/BaseUrlBar";
import { CapabilityPanel } from "@/components/panels/CapabilityPanel";
import { FhirChat } from "@/components/FhirChat";
import { InstancePanel } from "@/components/panels/InstancePanel";
import { OperationsPanel } from "@/components/panels/OperationsPanel";
import { RawPanel } from "@/components/panels/RawPanel";
import { SearchPanel } from "@/components/panels/SearchPanel";
import { WritePanel } from "@/components/panels/WritePanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExplorerBusProvider } from "@/lib/explorer-bus";

export function FhirExplorer() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ExplorerContent />
    </QueryClientProvider>
  );
}

function ExplorerContent() {
  const [baseUrl, setBaseUrl] = useBaseUrl();
  const [tab, setTab] = useState("search");

  return (
    <ExplorerBusProvider tab={tab} setTab={setTab}>
      <div className="min-h-screen bg-background">
        <BaseUrlBar baseUrl={baseUrl} onChange={setBaseUrl} />
        <main className="mx-auto max-w-7xl px-4 py-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0">
              {[
                ["capability", "Capability"],
                ["search", "Search"],
                ["instance", "Read / History"],
                ["write", "Create / Update"],
                ["operations", "Operations"],
                ["raw", "Raw Request"],
              ].map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-none border-b-2 border-transparent px-4 py-2 text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="mt-6 rounded-lg border bg-card p-5 shadow-sm">
              <TabsContent value="capability" className="m-0">
                <CapabilityPanel baseUrl={baseUrl} />
              </TabsContent>
              <TabsContent value="search" className="m-0">
                <SearchPanel baseUrl={baseUrl} />
              </TabsContent>
              <TabsContent value="instance" className="m-0">
                <InstancePanel baseUrl={baseUrl} />
              </TabsContent>
              <TabsContent value="write" className="m-0">
                <WritePanel baseUrl={baseUrl} />
              </TabsContent>
              <TabsContent value="operations" className="m-0">
                <OperationsPanel baseUrl={baseUrl} />
              </TabsContent>
              <TabsContent value="raw" className="m-0">
                <RawPanel baseUrl={baseUrl} />
              </TabsContent>
            </div>
          </Tabs>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Tip: if requests fail with a network error, ensure the FHIR server allows CORS from this
            origin.
          </p>
        </main>
        <FhirChat baseUrl={baseUrl} />
      </div>
    </ExplorerBusProvider>
  );
}
