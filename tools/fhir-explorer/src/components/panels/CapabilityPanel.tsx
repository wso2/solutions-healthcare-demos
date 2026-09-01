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

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fhirFetch } from "@/lib/fhir-client";
import type { CapabilityResourceLike, CapabilityStatementLike } from "@/lib/fhir-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponseView } from "../ResponseView";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const PAGE_SIZE = 10;

/** Page numbers to render: first, last, and a window around the current page. */
function pageNumbers(current: number, total: number): Array<number | "…"> {
  const candidates = [1, total, current - 1, current, current + 1];
  const inRange = candidates.filter((p) => p >= 1 && p <= total);
  const sorted = [...new Set(inRange)].sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

/** Case-insensitive match of resource rows against the type filter text. */
function filterByType(
  resources: CapabilityResourceLike[],
  filter: string,
): CapabilityResourceLike[] {
  const q = filter.trim().toLowerCase();
  if (!q) return resources;
  return resources.filter((r) =>
    String(r.type ?? "")
      .toLowerCase()
      .includes(q),
  );
}

export function CapabilityPanel({ baseUrl }: { baseUrl: string }) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");

  const {
    data: res,
    isFetching: loading,
    refetch,
  } = useQuery({
    queryKey: ["metadata-response", baseUrl],
    queryFn: () => fhirFetch("/metadata", {}, baseUrl),
    enabled: !!baseUrl,
  });

  const cs = res?.body as CapabilityStatementLike | undefined;
  const resources: CapabilityResourceLike[] = cs?.rest?.[0]?.resource ?? [];

  const filtered = useMemo(() => filterByType(resources, filter), [resources, filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {cs?.fhirVersion && (
            <>
              FHIR <Badge variant="secondary">{cs.fhirVersion}</Badge> · {cs.software?.name}{" "}
              {cs.software?.version}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TabsList className="h-8">
            <TabsTrigger value="overview" className="text-xs">
              Overview
            </TabsTrigger>
            <TabsTrigger value="raw" className="text-xs">
              Raw JSON
            </TabsTrigger>
          </TabsList>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={loading}>
            {loading ? "Loading…" : "Reload"}
          </Button>
        </div>
      </div>

      <TabsContent value="overview" className="m-0 space-y-4">
        {resources.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter resource types…"
                className="max-w-xs text-sm"
              />
              <span className="text-xs text-muted-foreground">
                {filtered.length} of {resources.length} resource types
              </span>
            </div>
            <div className="overflow-auto rounded-md border bg-card">
              {/* Fixed layout so column widths don't shift between pages. */}
              <table className="w-full table-fixed text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="w-80 px-3 py-2">Resource</th>
                    <th className="px-3 py-2">Interactions</th>
                    <th className="w-32 px-3 py-2">Search Params</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.type} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{r.type}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(r.interaction ?? []).map((i) => (
                            <Badge key={i.code} variant="outline" className="text-[10px]">
                              {i.code}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-muted-foreground">
                          {(r.searchParam ?? []).length}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={safePage === 1}
                      className={safePage === 1 ? "pointer-events-none opacity-50" : ""}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage((p) => Math.max(1, p - 1));
                      }}
                    />
                  </PaginationItem>
                  {pageNumbers(safePage, totalPages).map((p, i) => (
                    <PaginationItem key={`${p}-${i}`}>
                      {p === "…" ? (
                        <span className="px-2 text-sm text-muted-foreground">…</span>
                      ) : (
                        <PaginationLink
                          href="#"
                          isActive={p === safePage}
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(p);
                          }}
                        >
                          {p}
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={safePage === totalPages}
                      className={safePage === totalPages ? "pointer-events-none opacity-50" : ""}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage((p) => Math.min(totalPages, p + 1));
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
        {resources.length === 0 && (
          <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {loading ? "Loading capability statement…" : "No capability data available."}
          </div>
        )}
      </TabsContent>

      <TabsContent value="raw" className="m-0">
        <ResponseView res={res ?? null} />
      </TabsContent>
    </Tabs>
  );
}
