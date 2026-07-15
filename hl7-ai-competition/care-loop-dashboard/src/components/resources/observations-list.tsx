"use client";

import type { ObservationDto } from "@/lib/vitals";

import { useEffect, useMemo } from "react";

import { FhirButton } from "@/components/resources/fhir-drawer";
import { PaginationFooter, usePagination } from "@/components/ui/pagination-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { bloodPressureValue, cellValue, displayableRows } from "@/lib/vitals";

const GRID_COLUMNS = "96px 1fr 1fr 1fr 1fr 76px";
const PAGE_SIZE = 8;

export function ObservationsList({
  observations,
  loaded,
  error = false,
  focusedRefs,
}: {
  observations: ObservationDto[];
  loaded: boolean;
  error?: boolean;
  focusedRefs?: Set<string> | null;
}) {
  const rows = useMemo(() => displayableRows(observations), [observations]);
  const spansMultipleDays = useMemo(() => new Set(rows.map((row) => row.time.slice(0, 10))).size > 1, [rows]);
  const pager = usePagination(rows.length, PAGE_SIZE);
  const { reset } = pager;

  // focusedRefs is rebuilt per render upstream, so key the reset on its stable content; !loaded covers a patient switch (page-level poll clears the list).
  const focusKey = focusedRefs ? [...focusedRefs].sort().join(",") : "";
  useEffect(() => {
    if (!loaded) reset();
  }, [loaded, reset]);
  useEffect(() => reset(), [focusKey, reset]);

  if (!loaded) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-[26px] text-center text-[12.5px] text-[rgba(0,0,0,0.45)]">
        {error
          ? "care-loop-fhir-server unreachable — observations unavailable."
          : "No observations recorded yet for this patient."}
      </div>
    );
  }

  return (
    <div>
      <div
        className="grid gap-3 bg-[rgba(0,0,0,0.015)] px-5 py-[9px] text-[10.5px] font-semibold tracking-[0.05em] text-[rgba(0,0,0,0.4)] uppercase"
        style={{ gridTemplateColumns: GRID_COLUMNS }}
      >
        <span>Time</span>
        <span>Heart rate</span>
        <span>SpO₂</span>
        <span>Resp. rate</span>
        <span>Blood pressure</span>
        <span />
      </div>
      {rows.slice(pager.start, pager.end).map((row) => {
        const refs = [row.hr, row.spo2, row.rr, row.systolic, row.diastolic].filter(
          (o): o is ObservationDto => o !== null,
        );
        const highlighted = refs.some((o) => focusedRefs?.has(`Observation/${o.id}`));
        return (
          <div
            key={row.time}
            className={cn(
              "grid items-center gap-3 border-t border-[rgba(0,0,0,0.05)] px-5 py-[11px] transition-colors hover:bg-[rgba(0,0,0,0.02)]",
              highlighted && "bg-accent-brand/[0.05]",
            )}
            style={{ gridTemplateColumns: GRID_COLUMNS }}
          >
            <span className="font-mono text-[11.5px] text-[rgba(0,0,0,0.5)]">
              {/* row.time is the raw UTC bucket key - render local time, with the date prefixed once history spans days so the descending sort stays legible. */}
              {spansMultipleDays
                ? new Date(`${row.time}:00Z`).toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
                : new Date(`${row.time}:00Z`).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="font-mono text-[12px] font-medium text-[rgba(0,0,0,0.65)]">{cellValue(row.hr)}</span>
            <span className="font-mono text-[12px]">{cellValue(row.spo2)}</span>
            <span className="font-mono text-[12px]">{cellValue(row.rr)}</span>
            <span className="font-mono text-[12px]">{bloodPressureValue(row)}</span>
            {refs[0] ? (
              <FhirButton resourcePath={`Observation/${refs[0].id}`} raw={refs[0].raw} className="justify-self-start" />
            ) : (
              <span />
            )}
          </div>
        );
      })}
      <PaginationFooter pager={pager} />
    </div>
  );
}
