"use client";

import type { RiskAssessmentSummary } from "@/app/api/patients/[id]/risk-assessments/route";

import { useState } from "react";

import { FhirButton } from "@/components/resources/fhir-drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type AgenticRiskAssessmentDto = RiskAssessmentSummary;

function Reasoning({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const base = "border-l-2 border-accent-brand pl-3.5 text-[13px] leading-[1.65] whitespace-pre-wrap";
  if (!text) {
    return <div className={cn(base, "text-[rgba(0,0,0,0.4)]")}>No agentic reasoning recorded.</div>;
  }
  const clampable = text.length > 240;
  return (
    <div>
      <div className={cn(base, "text-[rgba(0,0,0,0.7)]", clampable && !expanded && "line-clamp-4")}>{text}</div>
      {clampable ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 ml-3.5 cursor-pointer text-[11.5px] font-semibold text-accent-brand hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

function formatWhen(occurrenceDateTime: string | null): string {
  if (!occurrenceDateTime) return "no recorded time";
  return new Date(occurrenceDateTime).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function ProbabilityCard({
  label,
  probability,
  sub,
  barColor,
}: {
  label: string;
  probability: number | null;
  sub: string;
  barColor: string;
}) {
  return (
    <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] px-3.5 py-3">
      <div className="text-[10.5px] font-semibold tracking-[0.05em] text-[rgba(0,0,0,0.42)] uppercase">{label}</div>
      <div className="mt-[7px] flex items-center gap-[9px]">
        <div className="h-[5px] flex-1 overflow-hidden rounded-[5px] bg-[rgba(0,0,0,0.08)]">
          <div
            className="h-full rounded-[5px]"
            style={{ width: `${Math.round((probability ?? 0) * 100)}%`, background: barColor }}
          />
        </div>
        <span className="font-mono text-[13px] font-semibold">
          {probability !== null ? probability.toFixed(2) : "—"}
        </span>
      </div>
      <div className="mt-[5px] text-[10.5px] text-[rgba(0,0,0,0.42)]">{sub}</div>
    </div>
  );
}

export function AgenticPredictionsList({
  riskAssessments,
  latestMlProbability,
  loaded,
  error = false,
  focusedRefs,
}: {
  riskAssessments: AgenticRiskAssessmentDto[];
  latestMlProbability: number | null;
  loaded: boolean;
  error?: boolean;
  focusedRefs?: Set<string> | null;
}) {
  if (!loaded) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 2 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (riskAssessments.length === 0) {
    return (
      <div className="px-5 py-[26px] text-center text-[12.5px] text-[rgba(0,0,0,0.45)]">
        {error
          ? "care-loop-fhir-server unreachable — agentic assessments unavailable."
          : "No agentic assessment yet — the agent runs once an emergency questionnaire is answered."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7 px-5 py-[18px]">
      {riskAssessments.map((riskAssessment, index) => {
        const probability = riskAssessment.predictions[0]?.probability ?? null;
        const qualitativeRisk = riskAssessment.predictions[0]?.qualitativeRisk ?? null;
        const highlighted = focusedRefs?.has(`RiskAssessment/${riskAssessment.id}`);
        return (
          <div key={riskAssessment.id} className={cn(highlighted && "rounded-xl bg-accent-brand/[0.04] p-2 -m-2")}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px] font-bold">Agentic risk assessment</span>
                {probability !== null ? (
                  <span className="rounded-[20px] bg-accent-brand px-[9px] py-0.5 text-[10.5px] font-semibold text-white">
                    probability {probability.toFixed(2)}
                  </span>
                ) : null}
                {qualitativeRisk ? (
                  <span className="rounded-[20px] border border-[rgba(0,0,0,0.15)] px-[9px] py-0.5 text-[10.5px] font-semibold text-[rgba(0,0,0,0.6)]">
                    {qualitativeRisk.toUpperCase()}
                  </span>
                ) : null}
                <span className="font-mono text-[10.5px] text-[rgba(0,0,0,0.4)]">
                  {formatWhen(riskAssessment.occurrenceDateTime)}
                </span>
              </div>
              <FhirButton
                resourcePath={`RiskAssessment/${riskAssessment.id}`}
                raw={riskAssessment.raw}
                label="RiskAssessment"
              />
            </div>
            <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[1fr_220px]">
              <div>
                <div className="mb-2 text-[10.5px] font-semibold tracking-[0.06em] text-[rgba(0,0,0,0.4)] uppercase">
                  Agent reasoning
                </div>
                <Reasoning text={riskAssessment.note} />
                <div className="mt-[18px] mb-2 text-[10.5px] font-semibold tracking-[0.06em] text-[rgba(0,0,0,0.4)] uppercase">
                  Cited FHIR resources
                </div>
                {riskAssessment.basis.length === 0 ? (
                  <div className="text-[11.5px] text-[rgba(0,0,0,0.4)]">None cited.</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {riskAssessment.basis.map((ref) => (
                      <span
                        key={ref}
                        className="rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[rgba(0,0,0,0.04)] px-[9px] py-[3px] font-mono text-[10.5px] text-[rgba(0,0,0,0.65)]"
                      >
                        {ref}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2.5">
                <ProbabilityCard
                  label="Agentic probability"
                  probability={probability}
                  sub="ai-service /risk-assessment"
                  barColor="#FF7300"
                />
                {index === 0 ? (
                  <ProbabilityCard
                    label="ML probability"
                    probability={latestMlProbability}
                    sub="heart-risk /predict"
                    barColor="rgba(0,0,0,0.45)"
                  />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
