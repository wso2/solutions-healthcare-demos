"use client";

import type { QuestionnaireResponseSummary } from "@/app/api/patients/[id]/questionnaire-responses/route";

import { useEffect } from "react";

import { FhirButton } from "@/components/resources/fhir-drawer";
import { PaginationFooter, usePagination } from "@/components/ui/pagination-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Each response is a full Q/A block, so page one response at a time.
const PAGE_SIZE = 1;

export type QuestionnaireResponseDto = QuestionnaireResponseSummary;

function formatAuthored(authored: string | null): string {
  if (!authored) return "no authored time";
  return new Date(authored).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function QuestionnaireResponsesList({
  responses,
  loaded,
  error = false,
  focusedRefs,
}: {
  responses: QuestionnaireResponseDto[];
  loaded: boolean;
  error?: boolean;
  focusedRefs?: Set<string> | null;
}) {
  const pager = usePagination(responses.length, PAGE_SIZE);
  const { reset } = pager;

  // !loaded covers a patient switch (page-level poll clears the list).
  useEffect(() => {
    if (!loaded) reset();
  }, [loaded, reset]);

  if (!loaded) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 2 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (responses.length === 0) {
    return (
      <div className="px-5 py-[18px]">
        <div className="py-[26px] text-center text-[12.5px] text-[rgba(0,0,0,0.45)]">
          {error
            ? "care-loop-fhir-server unreachable — questionnaire responses unavailable."
            : "No questionnaire sent — vitals have stayed below the escalation threshold."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-5 px-5 py-[18px]">
        {responses.slice(pager.start, pager.end).map((response) => {
        const status = response.raw.status ?? "unknown";
        const completed = status === "completed";
        const highlighted = focusedRefs?.has(`QuestionnaireResponse/${response.id}`);
        return (
          <div key={response.id} className={cn(highlighted && "rounded-xl bg-accent-brand/[0.04] p-2 -m-2")}>
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px] font-bold">
                  {response.questionnaireTitle ?? "Untitled questionnaire"}
                </span>
                <span
                  className={cn(
                    "rounded-[20px] px-[9px] py-0.5 text-[10.5px] font-semibold",
                    completed
                      ? "bg-accent-brand text-white"
                      : "border border-[rgba(0,0,0,0.2)] bg-transparent text-[rgba(0,0,0,0.5)]",
                  )}
                >
                  {status}
                </span>
              </div>
              <div className="flex gap-2">
                {response.questionnaireRef && response.questionnaireRaw ? (
                  <FhirButton
                    resourcePath={response.questionnaireRef}
                    raw={response.questionnaireRaw}
                    label="Questionnaire"
                  />
                ) : null}
                <FhirButton
                  resourcePath={`QuestionnaireResponse/${response.id}`}
                  raw={response.raw}
                  label="QuestionnaireResponse"
                />
              </div>
            </div>
            <div className="mb-4 font-mono text-[10.5px] text-[rgba(0,0,0,0.4)]">
              QuestionnaireResponse/{response.id} · {formatAuthored(response.authored)} ·{" "}
              {response.answers.length} answer(s)
            </div>
            {response.answers.length === 0 ? (
              <div className="text-[12.5px] text-[rgba(0,0,0,0.45)]">No answers recorded.</div>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 md:grid-cols-2">
                {response.answers.map((answer, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={index} className="border-t border-[rgba(0,0,0,0.06)] py-2.5">
                    <div className="text-[12px] leading-[1.45] text-[rgba(0,0,0,0.55)]">{answer.question}</div>
                    <div className="mt-1 text-[12.5px] font-semibold text-[rgba(0,0,0,0.7)]">{answer.answer}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      </div>
      <PaginationFooter pager={pager} />
    </div>
  );
}
