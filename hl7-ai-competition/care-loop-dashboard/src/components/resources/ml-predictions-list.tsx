"use client";

import type { RiskAssessmentSummary } from "@/app/api/patients/[id]/risk-assessments/route";

import { useEffect } from "react";

import { FhirButton } from "@/components/resources/fhir-drawer";
import { PaginationFooter, usePagination } from "@/components/ui/pagination-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type MlRiskAssessmentDto = RiskAssessmentSummary;

const GRID_COLUMNS = "96px 1.3fr 1fr 1fr 76px";
const PAGE_SIZE = 8;

function formatTime(occurrenceDateTime: string | null): string {
  if (!occurrenceDateTime) return "—";
  return new Date(occurrenceDateTime).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" });
}

// The RiskAssessment resource never persists the ML model's input triple ({age, sex, max_hr}) — that only exists as an in-memory request to heart-risk-service. Show the real `basis` Observation references instead of inventing a value for this column.
function modelInput(riskAssessment: MlRiskAssessmentDto): string {
  if (riskAssessment.basis.length === 0) return "—";
  return riskAssessment.basis.join(", ");
}

// Long UUID ref lists overflow the compact mono cell; middle-truncate so the type and trailing id stay readable. Full value in title.
function middleTruncate(text: string, max = 44): string {
  if (text.length <= max) return text;
  const half = Math.floor((max - 1) / 2);
  return `${text.slice(0, half)}…${text.slice(text.length - half)}`;
}

export function MlPredictionsList({
  riskAssessments,
  loaded,
  error = false,
  focusedRefs,
  escalatedRiskAssessmentIds,
}: {
  riskAssessments: MlRiskAssessmentDto[];
  loaded: boolean;
  error?: boolean;
  focusedRefs?: Set<string> | null;
  // RiskAssessment ids an open Task's basedOn references - the FHIR record that this prediction escalated.
  escalatedRiskAssessmentIds?: Set<string>;
}) {
  const pager = usePagination(riskAssessments.length, PAGE_SIZE);
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

  if (riskAssessments.length === 0) {
    return (
      <div className="py-[26px] text-center text-[12.5px] text-[rgba(0,0,0,0.45)]">
        {error
          ? "care-loop-fhir-server unreachable — ML predictions unavailable."
          : "No ML predictions recorded yet for this patient."}
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
        <span>Model input</span>
        <span>Probability</span>
        <span>Outcome</span>
        <span />
      </div>
      {riskAssessments.slice(pager.start, pager.end).map((riskAssessment) => {
        const probability = riskAssessment.predictions[0]?.probability ?? null;
        const escalated = escalatedRiskAssessmentIds?.has(riskAssessment.id) ?? false;
        const outcome = escalated ? "escalated" : "not escalated";
        const highlighted = focusedRefs?.has(`RiskAssessment/${riskAssessment.id}`);
        return (
          <div
            key={riskAssessment.id}
            className={cn(
              "grid items-center gap-3 border-t border-[rgba(0,0,0,0.05)] px-5 py-3 transition-colors hover:bg-[rgba(0,0,0,0.02)]",
              highlighted && "bg-accent-brand/[0.05]",
            )}
            style={{ gridTemplateColumns: GRID_COLUMNS }}
          >
            <span className="font-mono text-[11.5px] text-[rgba(0,0,0,0.5)]">
              {formatTime(riskAssessment.occurrenceDateTime)}
            </span>
            <span className="truncate font-mono text-[11.5px] text-[rgba(0,0,0,0.6)]" title={modelInput(riskAssessment)}>
              {middleTruncate(modelInput(riskAssessment))}
            </span>
            <div className="flex items-center gap-2">
              {/* analysis-service always sets prediction[0].probabilityDecimal when creating a RiskAssessment (see buildMlRiskAssessment) — null is not reachable for real records, so this always renders a real bar. */}
              <div className="h-[5px] w-[54px] shrink-0 overflow-hidden rounded-[5px] bg-[rgba(0,0,0,0.08)]">
                <div
                  className="h-full rounded-[5px] bg-accent-brand"
                  style={{ width: `${Math.round((probability ?? 0) * 100)}%` }}
                />
              </div>
              <span className="font-mono text-[12px] font-semibold">
                {probability !== null ? probability.toFixed(2) : "—"}
              </span>
            </div>
            <span
              className={cn(
                "w-fit rounded-[20px] px-[9px] py-0.5 text-[11px] font-semibold",
                escalated
                  ? "bg-accent-brand text-white"
                  : "border border-[rgba(0,0,0,0.15)] bg-transparent text-[rgba(0,0,0,0.5)]",
              )}
            >
              {outcome}
            </span>
            <FhirButton
              resourcePath={`RiskAssessment/${riskAssessment.id}`}
              raw={riskAssessment.raw}
              className="justify-self-start"
            />
          </div>
        );
      })}
      <PaginationFooter pager={pager} />
    </div>
  );
}
