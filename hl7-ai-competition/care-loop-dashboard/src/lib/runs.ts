import type { CareLoopEvent } from "@/lib/db";

import { RUN_BOUNDARY_LABEL, STAGE_DEFS } from "@/lib/stages";

export type StageStatus = "done" | "active" | "pending" | "not-observable";

// The settled healthy outcome - exported so the UI's positive treatments key off one string, not re-typed literals.
export const OUTCOME_BELOW_THRESHOLD = "Below escalation threshold";

export interface RunStage {
  key: string;
  status: StageStatus;
  event: CareLoopEvent | null;
}

export interface Run {
  id: string;
  startedAt: string;
  endedAt: string;
  isLatest: boolean;
  outcome: string;
  stages: RunStage[];
}

const stageIndexByLabel = new Map<string, number>(STAGE_DEFS.map((s, i) => [s.label, i]));

export function segmentRuns(events: CareLoopEvent[]): Run[] {
  const ascending = [...events].reverse();
  const runs: Run[] = [];
  let current: CareLoopEvent[] = [];

  function flush() {
    if (current.length === 0) return;
    runs.push(buildRun(current, false));
    current = [];
  }

  for (const event of ascending) {
    if (event.label === RUN_BOUNDARY_LABEL) flush();
    current.push(event);
  }
  flush();

  if (runs.length > 0) {
    const latest = runs[runs.length - 1]!;
    latest.isLatest = true;
    // Only show a spinner when the run is genuinely still in flight - a run settled below threshold has nothing more coming.
    if (latest.outcome === "Escalated, no Task yet") {
      latest.stages = markLatestActive(latest.stages);
    }
  }

  return runs.reverse();
}

function buildRun(runEvents: CareLoopEvent[], isLatest: boolean): Run {
  const byStageIndex = new Map<number, CareLoopEvent>();
  for (const event of runEvents) {
    const idx = stageIndexByLabel.get(event.label);
    if (idx === undefined) continue;
    // A stage can legitimately fire more than once in a run (e.g. a retried agentic call) - keep the earliest occurrence for a stable timeline.
    if (!byStageIndex.has(idx)) byStageIndex.set(idx, event);
  }

  const stages: RunStage[] = STAGE_DEFS.map((def, i) => {
    if (def.key === "clinician") {
      return { key: def.key, status: "not-observable", event: null };
    }
    const event = byStageIndex.get(i) ?? null;
    if (event) return { key: def.key, status: "done", event };
    return { key: def.key, status: "pending", event: null };
  });

  const hasTask = byStageIndex.has(stageIndexByLabel.get("FHIR Task created for front-desk")!);
  const hasEscalation = byStageIndex.has(stageIndexByLabel.get("Escalation triggered")!);
  // analysis-service stamps escalated=true/false on the agentic-complete event; "false" means the run settled below the agentic threshold, so nothing more is coming. Events predating the key keep the in-flight outcome.
  const agenticEvent = byStageIndex.get(stageIndexByLabel.get("Agentic risk assessment complete")!) ?? null;
  const settledBelowThreshold = agenticEvent?.payload?.escalated === "false";
  const outcome = hasTask
    ? "Task created"
    : hasEscalation && !settledBelowThreshold
      ? "Escalated, no Task yet"
      : OUTCOME_BELOW_THRESHOLD;

  const startedAt = runEvents[0]!.receivedAt;
  const endedAt = runEvents[runEvents.length - 1]!.receivedAt;

  return {
    id: startedAt,
    startedAt,
    endedAt,
    isLatest,
    outcome,
    stages,
  };
}

// Only the single most-recent run's furthest-reached non-terminal stage is shown as "active" (a spinner) - every other run is settled history.
function markLatestActive(stages: RunStage[]): RunStage[] {
  let lastDoneIndex = -1;
  stages.forEach((s, i) => {
    if (s.status === "done") lastDoneIndex = i;
  });
  if (lastDoneIndex === -1 || lastDoneIndex >= stages.length - 2) return stages;
  return stages.map((s, i) => (i === lastDoneIndex ? { ...s, status: "active" } : s));
}
