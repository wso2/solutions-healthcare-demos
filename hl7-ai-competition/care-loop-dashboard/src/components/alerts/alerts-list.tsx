"use client";

import type { RiskAssessmentSummary } from "@/app/api/patients/[id]/risk-assessments/route";
import type { TaskSummary } from "@/app/api/patients/[id]/tasks/route";

import { useEffect, useState } from "react";

import { FhirButton } from "@/components/resources/fhir-drawer";
import { PaginationFooter, usePagination } from "@/components/ui/pagination-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TASKS_POLL_INTERVAL_MS = 1_000;
const PAGE_SIZE = 5;

const GRID_COLUMNS = "84px 76px 1fr 170px 52px 52px 76px";

const CLOSED_STATUSES = new Set(["completed", "cancelled", "entered-in-error"]);

// A Task's basedOn carries normalized "RiskAssessment/{id}" reference suffixes - match those ids against whichever prediction array (ML or agentic) actually contains that RiskAssessment, so the column shows a real probability or a dash, never a guess.
function matchProbability(task: TaskSummary, predictions: RiskAssessmentSummary[]): number | null {
  const match = predictions.find((prediction) => task.basedOn.includes(`RiskAssessment/${prediction.id}`));
  return match?.predictions[0]?.probability ?? null;
}

function formatProbability(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

// Real evidence chips derived from basedOn's own resource types (e.g. "2x Observation"), never a fabricated label.
function evidenceChips(task: TaskSummary): string[] {
  const counts = new Map<string, number>();
  for (const ref of task.basedOn) {
    const type = ref.split("/")[0] ?? ref;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => (count > 1 ? `${count}x ${type}` : type));
}

// Date prefix only once history spans days - real alert history spans days and time-only reads as a sort bug (same rule as the vitals table).
function formatAuthored(authoredOn: string | null, spansMultipleDays: boolean): string {
  if (!authoredOn) return "—";
  const date = new Date(authoredOn);
  const time = date.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" });
  if (!spansMultipleDays) return time;
  return `${date.toLocaleDateString([], { month: "numeric", day: "numeric" })} ${time}`;
}

export function AlertsList({
  patientId,
  focusedTaskId,
  onFocus,
  onLoaded,
  onOpenTasks,
  mlPredictions,
  agenticPredictions,
  hasRiskData,
}: {
  patientId: string;
  focusedTaskId: string | null;
  onFocus: (task: TaskSummary | null) => void;
  onLoaded?: (loadedAt: number) => void;
  // Reports the open (non-closed) tasks so the page can derive KPI-tile data from the same poll this panel renders from.
  onOpenTasks?: (openTasks: TaskSummary[]) => void;
  mlPredictions: RiskAssessmentSummary[];
  agenticPredictions: RiskAssessmentSummary[];
  // True when the patient has at least one ML RiskAssessment - with zero open Tasks that means risk was assessed and no escalation was needed, a real FHIR-derived fact.
  hasRiskData?: boolean;
}) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);

    async function poll() {
      try {
        const response = await fetch(`/api/patients/${patientId}/tasks`);
        const data = (await response.json()) as { tasks: TaskSummary[]; error?: boolean };
        if (!cancelled) {
          setError(data.error === true);
          // A degraded response keeps the last good list - never report fabricated zero open tasks upstream.
          if (!data.error) {
            setTasks(data.tasks);
            onLoaded?.(Date.now());
            onOpenTasks?.(data.tasks.filter((task) => !CLOSED_STATUSES.has(task.status.toLowerCase())));
          }
        }
      } catch (err) {
        console.error("failed to poll tasks", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    poll();
    const interval = setInterval(poll, TASKS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react/exhaustive-deps
  }, [patientId]);

  const openTasks = tasks.filter((task) => !CLOSED_STATUSES.has(task.status.toLowerCase()));
  const spansMultipleDays =
    new Set(openTasks.map((task) => task.authoredOn?.slice(0, 10)).filter((day) => day != null)).size > 1;

  const pager = usePagination(openTasks.length, PAGE_SIZE);
  const { reset } = pager;
  useEffect(() => reset(), [patientId, reset]);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-[18px] pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold tracking-[-0.2px]">Alerts</span>
          <span className="rounded-[20px] bg-accent-brand px-2 py-0.5 text-[10.5px] font-bold text-white">
            {openTasks.length}
          </span>
        </div>
        <span className="font-mono text-[10px] text-[rgba(0,0,0,0.4)]">Task?status=requested</span>
      </div>

      {!loaded ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 2 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : openTasks.length === 0 ? (
        error ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-[30px] text-center">
            <div className="text-[12.5px] font-semibold text-[rgba(0,0,0,0.5)]">Tasks unavailable</div>
            <div className="text-[11.5px] leading-normal text-[rgba(0,0,0,0.4)]">
              ehr-fhir-server unreachable — open tasks cannot be shown.
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-[30px] text-center">
            <div
              className={cn(
                "flex size-9 items-center justify-center rounded-full border-[1.5px] border-dashed text-[15px]",
                hasRiskData
                  ? "border-[rgba(22,128,61,0.4)] text-[#15803d]"
                  : "border-[rgba(0,0,0,0.2)] text-[rgba(0,0,0,0.3)]",
              )}
            >
              ✓
            </div>
            <div className={cn("text-[12.5px] font-semibold", hasRiskData ? "text-[#15803d]" : "text-[rgba(0,0,0,0.5)]")}>
              No open tasks
            </div>
            <div className="text-[11.5px] leading-normal text-[rgba(0,0,0,0.4)]">
              {hasRiskData
                ? "Risk was assessed and no escalation Task was needed."
                : tasks.length === 0
                  ? "No Task resources recorded yet for this patient."
                  : "All recorded Tasks are closed."}
            </div>
          </div>
        )
      ) : (
        <div>
          <div
            className="grid gap-3 bg-[rgba(0,0,0,0.015)] px-5 py-[9px] text-[10.5px] font-semibold tracking-[0.05em] text-[rgba(0,0,0,0.4)] uppercase"
            style={{ gridTemplateColumns: GRID_COLUMNS }}
          >
            <span>Priority</span>
            <span>Time</span>
            <span>Description</span>
            <span>Evidence</span>
            <span>ML</span>
            <span>Agent</span>
            <span />
          </div>
          {openTasks.slice(pager.start, pager.end).map((task) => {
            const focused = focusedTaskId === task.id;
            const hasEvidence = task.basedOn.length > 0;
            const chips = evidenceChips(task);
            const stat = (task.priority ?? "").toLowerCase() === "stat";
            return (
              <div
                key={task.id}
                onClick={() => hasEvidence && onFocus(focused ? null : task)}
                className={cn(
                  "grid items-center gap-3 border-t border-[rgba(0,0,0,0.05)] px-5 py-3 transition-colors",
                  hasEvidence && "cursor-pointer",
                  focused
                    ? "bg-accent-brand/[0.06] shadow-[inset_3px_0_0_0_var(--color-accent-brand)]"
                    : "hover:bg-[rgba(0,0,0,0.02)]",
                )}
                style={{ gridTemplateColumns: GRID_COLUMNS }}
              >
                <span
                  className={cn(
                    "w-fit rounded-[20px] px-[9px] py-0.5 text-[10.5px] font-semibold uppercase",
                    stat
                      ? "bg-accent-brand text-white"
                      : "border border-[rgba(0,0,0,0.15)] bg-transparent text-[rgba(0,0,0,0.5)]",
                  )}
                >
                  {task.priority ?? task.status}
                </span>
                <span className="font-mono text-[11.5px] text-[rgba(0,0,0,0.5)]">
                  {formatAuthored(task.authoredOn, spansMultipleDays)}
                </span>
                <span
                  className="truncate text-[13px] font-semibold"
                  title={task.description ?? "No description recorded"}
                >
                  {task.description ?? "No description recorded"}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {chips.length > 0 ? (
                    chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-[6px] border border-[rgba(0,0,0,0.09)] bg-[rgba(0,0,0,0.04)] px-2 py-[3px] font-mono text-[10px] whitespace-nowrap text-[rgba(0,0,0,0.6)]"
                      >
                        {chip}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-[rgba(0,0,0,0.4)]">no linked FHIR evidence</span>
                  )}
                </span>
                <span className="font-mono text-[12px] font-semibold">
                  {formatProbability(matchProbability(task, mlPredictions))}
                </span>
                <span className="font-mono text-[12px] font-semibold">
                  {formatProbability(matchProbability(task, agenticPredictions))}
                </span>
                <span onClick={(event) => event.stopPropagation()} className="justify-self-start">
                  <FhirButton resourcePath={`Task/${task.id}`} raw={task.raw} />
                </span>
              </div>
            );
          })}
          <PaginationFooter pager={pager} />
        </div>
      )}
    </div>
  );
}
