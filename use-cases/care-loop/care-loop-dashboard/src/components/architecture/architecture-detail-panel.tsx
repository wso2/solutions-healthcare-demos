import type { ArchitectureBoxDef } from "@/lib/architecture";
import type { Run } from "@/lib/runs";

import { StageDetailPanel } from "@/components/pipeline/stage-detail-panel";
import { STAGE_DEFS } from "@/lib/stages";

// Actors carry no real events - they're context boxes from the diagram, so there's nothing backing them to show.
export function ArchitectureDetailPanel({ box, run }: { box: ArchitectureBoxDef; run: Run }) {
  if (box.isActor || box.stageKeys.length === 0) {
    return (
      <div className="animate-canvas-fade-up rounded-2xl border border-dashed border-border/70 bg-muted/30 p-5">
        <div className="mb-1 text-[15px] font-bold tracking-tight">{box.label}</div>
        <p className="text-sm text-muted-foreground">
          Drawn for context per the architecture diagram - this actor has no events reported by this dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12px] font-semibold text-muted-foreground">
        {box.label} is backed by {box.stageKeys.length} real event{box.stageKeys.length === 1 ? "" : "s"}:
      </div>
      {box.stageKeys.map((key) => {
        const index = STAGE_DEFS.findIndex((def) => def.key === key);
        const stage = run.stages.find((s) => s.key === key);
        if (index === -1 || !stage) return null;
        return <StageDetailPanel key={key} stage={stage} index={index} />;
      })}
    </div>
  );
}
