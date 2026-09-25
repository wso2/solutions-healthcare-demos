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

import { useState } from "react";
import type { BundleLike, ResourceLike } from "@/lib/fhir-types";
import { encodeFhirPathSegment } from "@/lib/fhir-client";
import { useFhirRequest } from "@/hooks/use-fhir-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourceCombobox } from "../ResourceCombobox";
import { BasePanel } from "./BasePanel";
import { RequestPreviewBar } from "../RequestPreviewBar";
import { SearchParamCombobox } from "../SearchParamCombobox";
import { CopyButton } from "../CopyButton";
import { CodeBlock } from "../CodeBlock";
import { Field } from "../Field";
import { RowSection, RemoveRowButton } from "../RowSection";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useResourceSearchParams } from "@/hooks/use-resource-search-params";
import { valueHintForType } from "@/lib/fhir-search-params";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronsLeft, ChevronsRight, RefreshCw, Search } from "lucide-react";

const DEFAULT_PAGE_SIZE = 5;

function pageNumbers(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

/** Address page N by swapping `_page` on the self link, which carries the full query (the WSO2 server accepts any page). */
function pageUrl(bundle: BundleLike | undefined, target: number): string | undefined {
  const self = bundle?.link?.find((link) => link.relation === "self")?.url;
  if (!self) return undefined;
  return /([?&]_page=)\d+/.test(self)
    ? self.replace(/([?&]_page=)\d+/, `$1${target}`)
    : `${self}${self.includes("?") ? "&" : "?"}_page=${target}`;
}

export function SearchPanel({ baseUrl }: { baseUrl: string }) {
  const [resourceType, setResourceType] = useState("Patient");
  const [params, setParams] = useState<Array<{ k: string; v: string }>>([
    { k: "_count", v: String(DEFAULT_PAGE_SIZE) },
  ]);
  const { res, loading, run: send } = useFhirRequest(baseUrl);
  const [usePost, setUsePost] = useState(false);
  const [sortParam, setSortParam] = useState("");
  const [sortDesc, setSortDesc] = useState(false);
  const [summary, setSummary] = useState("");
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const { byName } = useResourceSearchParams(resourceType, baseUrl);

  function toggleRow(i: number) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function update(i: number, field: "k" | "v", v: string) {
    setParams((p) => p.map((row, idx) => (idx === i ? { ...row, [field]: v } : row)));
  }
  function add() {
    setParams((p) => [...p, { k: "", v: "" }]);
  }
  function remove(i: number) {
    setParams((p) => p.filter((_, idx) => idx !== i));
  }

  function buildQuery(): string {
    const parts = params
      .filter((p) => p.k.trim())
      .map((p) => `${encodeURIComponent(p.k)}=${encodeURIComponent(p.v)}`);
    if (
      params.some((p) => p.k.trim() === "_count") &&
      !params.some((p) => p.k.trim() === "_total")
    ) {
      parts.push("_total=accurate");
    }
    if (sortParam.trim())
      parts.push(`_sort=${encodeURIComponent((sortDesc ? "-" : "") + sortParam.trim())}`);
    if (summary) parts.push(`_summary=${encodeURIComponent(summary)}`);
    return parts.join("&");
  }

  function run() {
    setOpenRows(new Set());
    setPage(1);
    const qs = buildQuery();
    const rt = encodeFhirPathSegment(resourceType);
    if (usePost) {
      void send(`/${rt}/_search`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: qs,
      });
    } else {
      void send(`/${rt}${qs ? `?${qs}` : ""}`);
    }
  }

  function goToPage(target: number) {
    const next = Math.max(1, Math.min(target, totalPages));
    if (next === safePage) return;
    if (hasServerPagination) {
      const url = pageUrl(bundle, next);
      if (!url) return;
      void send(url);
    }
    setOpenRows(new Set());
    setPage(next);
  }

  function reload() {
    const self = bundle?.link?.find((link) => link.relation === "self")?.url;
    if (!self) return;
    void send(self);
    setOpenRows(new Set());
  }

  const bundle = res?.body as BundleLike | undefined;
  const entries = bundle?.entry ?? [];
  const pageSize = getPageSize(params);
  const totalResources = typeof bundle?.total === "number" ? bundle.total : entries.length;
  const totalPages = Math.max(1, Math.ceil(totalResources / pageSize));
  const safePage = Math.min(page, totalPages);
  const hasServerPagination = entries.length <= pageSize && totalResources > entries.length;
  const pageEntries = hasServerPagination
    ? entries
    : entries.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selfLink = bundle?.link?.some((link) => link.relation === "self") ?? false;
  const firstLink = bundle?.link?.some((link) => link.relation === "first") ?? false;
  const lastLink = bundle?.link?.some((link) => link.relation === "last") ?? false;

  const form = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Resource Type" htmlFor="rt">
          <ResourceCombobox
            id="rt"
            value={resourceType}
            onChange={setResourceType}
            baseUrl={baseUrl}
          />
        </Field>
        <Field label="Method">
          <div className="flex h-9 items-center gap-3 rounded-md border bg-card px-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="search-method"
                checked={!usePost}
                onChange={() => setUsePost(false)}
              />
              GET
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="search-method"
                checked={usePost}
                onChange={() => setUsePost(true)}
              />
              POST /_search
            </label>
          </div>
        </Field>
      </div>

      <RowSection label="Search Parameters" addLabel="Add parameter" onAdd={add}>
        {params.map((p, i) => {
          const def = byName.get(p.k);
          return (
            <div key={i} className="flex gap-2">
              <div className="flex-1">
                <SearchParamCombobox
                  resourceType={resourceType}
                  baseUrl={baseUrl}
                  value={p.k}
                  onChange={(name) => update(i, "k", name)}
                />
              </div>
              <Input
                aria-label="Parameter value"
                placeholder={valueHintForType(def?.type)}
                value={p.v}
                onChange={(e) => update(i, "v", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                className="flex-1 font-mono text-sm"
              />
              <RemoveRowButton onClick={() => remove(i)} ariaLabel="Remove parameter" />
            </div>
          );
        })}
      </RowSection>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_160px]">
        <Field label="Sort by" htmlFor="sort-param">
          <Input
            id="sort-param"
            value={sortParam}
            onChange={(e) => setSortParam(e.target.value)}
            placeholder="_lastUpdated, name, date…"
            className="font-mono text-sm"
          />
        </Field>
        <Field label="Direction">
          <div className="flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="sort-dir"
                checked={!sortDesc}
                onChange={() => setSortDesc(false)}
              />
              Asc
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="sort-dir"
                checked={sortDesc}
                onChange={() => setSortDesc(true)}
              />
              Desc
            </label>
          </div>
        </Field>
        <Field label="_summary" htmlFor="summary-mode">
          <select
            id="summary-mode"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">(none)</option>
            <option value="true">true</option>
            <option value="text">text</option>
            <option value="data">data</option>
            <option value="count">count</option>
          </select>
        </Field>
      </div>

      <RequestPreviewBar
        method={usePost ? "POST" : "GET"}
        path={
          usePost
            ? `/${resourceType}/_search`
            : `/${resourceType}${buildQuery() ? `?${buildQuery()}` : ""}`
        }
      >
        <Button onClick={run} disabled={loading} size="sm">
          <Search className="mr-1 h-4 w-4" />
          {loading ? "Searching…" : "Search"}
        </Button>
      </RequestPreviewBar>
    </>
  );

  const pagination = bundle?.resourceType === "Bundle" && (
    <Pagination className="mx-0 w-auto justify-end">
      <PaginationContent>
        {selfLink && (
          <PaginationItem>
            <PaginationLink
              href="#"
              aria-label="Reload current page"
              title="Reload current page"
              onClick={(event) => {
                event.preventDefault();
                reload();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              <span className="sr-only">Reload current page</span>
            </PaginationLink>
          </PaginationItem>
        )}
        {firstLink && (
          <PaginationItem>
            <PaginationLink
              href="#"
              aria-label="Go to first page"
              title="First page"
              className={safePage === 1 ? "pointer-events-none opacity-50" : ""}
              onClick={(event) => {
                event.preventDefault();
                goToPage(1);
              }}
            >
              <ChevronsLeft className="h-4 w-4" />
              <span className="sr-only">First page</span>
            </PaginationLink>
          </PaginationItem>
        )}
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={safePage === 1}
            className={safePage === 1 ? "pointer-events-none opacity-50" : ""}
            onClick={(event) => {
              event.preventDefault();
              goToPage(safePage - 1);
            }}
          />
        </PaginationItem>
        {pageNumbers(safePage, totalPages).map((candidate, index) => (
          <PaginationItem key={`${candidate}-${index}`}>
            {candidate === "…" ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center text-sm text-muted-foreground">
                …
              </span>
            ) : (
              <PaginationLink
                href="#"
                isActive={candidate === safePage}
                className="h-9 w-9 shrink-0 p-0"
                onClick={(event) => {
                  event.preventDefault();
                  goToPage(candidate);
                }}
              >
                {candidate}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={safePage === totalPages}
            className={safePage === totalPages ? "pointer-events-none opacity-50" : ""}
            onClick={(event) => {
              event.preventDefault();
              goToPage(safePage + 1);
            }}
          />
        </PaginationItem>
        {lastLink && (
          <PaginationItem>
            <PaginationLink
              href="#"
              aria-label="Go to last page"
              title="Last page"
              className={safePage === totalPages ? "pointer-events-none opacity-50" : ""}
              onClick={(event) => {
                event.preventDefault();
                goToPage(totalPages);
              }}
            >
              <ChevronsRight className="h-4 w-4" />
              <span className="sr-only">Last page</span>
            </PaginationLink>
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  );

  const responseExtra = (
    <>
      {bundle?.resourceType === "Bundle" && Array.isArray(bundle.entry) && (
        <div className="overflow-hidden rounded-md border bg-card">
          <ul className="max-h-96 divide-y overflow-y-auto">
            {pageEntries.map((e, i) => {
              const r = e.resource ?? {};
              const expanded = openRows.has(i);
              return (
                <li key={i} className="text-sm">
                  <div className="flex items-start gap-1 pr-2 hover:bg-muted/50">
                    <button
                      type="button"
                      onClick={() => toggleRow(i)}
                      aria-expanded={expanded}
                      className="flex min-w-0 flex-1 items-start justify-between gap-2 px-3 py-2 text-left"
                    >
                      <span className="min-w-0">
                        <code className="font-mono text-xs text-primary">
                          {r.resourceType}/{r.id}
                        </code>
                        {r.meta?.versionId && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            v{r.meta.versionId}
                          </span>
                        )}
                        <span className="block truncate text-xs text-muted-foreground">
                          {summarize(r)}
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          expanded && "rotate-180",
                        )}
                      />
                    </button>
                    {r.id && (
                      <CopyButton value={r.id} ariaLabel={`Copy id ${r.id}`} className="mt-1.5" />
                    )}
                  </div>
                  {expanded && (
                    <CodeBlock
                      code={JSON.stringify(r, null, 2)}
                      className="max-h-80 rounded-none border-0 border-t bg-muted/30 px-3 py-2"
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              Showing {entries.length ? (safePage - 1) * pageSize + 1 : 0}–
              {(safePage - 1) * pageSize + pageEntries.length} of {totalResources} resources
            </span>
            {pagination}
          </div>
        </div>
      )}
    </>
  );

  return (
    <BasePanel res={res} responseExtra={responseExtra}>
      {form}
    </BasePanel>
  );
}

function getPageSize(params: Array<{ k: string; v: string }>): number {
  const count = params.find((param) => param.k.trim() === "_count")?.v.trim();
  const pageSize = Number.parseInt(count ?? "", 10);
  return Number.isFinite(pageSize) && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
}

function summarize(r: ResourceLike): string {
  if (!r) return "";
  // HumanName (Patient, Practitioner, RelatedPerson, …)
  if (Array.isArray(r.name) && r.name[0]) {
    const n = r.name[0];
    const assembled = [n.prefix?.join(" "), n.given?.join(" "), n.family].filter(Boolean).join(" ");
    if (assembled || n.text) return assembled || n.text || "";
  }
  if (typeof r.name === "string") return r.name;
  // Coded concepts (Observation, Condition, Procedure, …)
  const code = r.code ?? r.medicationCodeableConcept ?? r.vaccineCode;
  if (code?.text) return code.text;
  if (code?.coding?.[0]) return code.coding[0].display || code.coding[0].code || "";
  if (r.title) return r.title;
  if (r.description) return r.description;
  // Fall back to a few status-ish fields
  const bits: string[] = [];
  if (r.status) bits.push(r.status);
  if (r.class?.code) bits.push(r.class.code);
  if (r.period?.start) bits.push(r.period.start);
  if (typeof r.value === "string") bits.push(r.value);
  return bits.join(" · ");
}
