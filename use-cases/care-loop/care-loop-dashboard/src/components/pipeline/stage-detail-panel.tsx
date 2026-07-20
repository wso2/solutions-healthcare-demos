import type { RunStage } from "@/lib/runs";

import { STAGE_DEFS } from "@/lib/stages";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<RunStage["status"], string> = {
  done: "Received",
  active: "Processing",
  pending: "Pending",
  "not-observable": "Not observable",
};

const STATUS_BADGE: Record<RunStage["status"], string> = {
  done: "bg-accent-brand/10 text-accent-brand/70",
  active: "bg-accent-brand text-background",
  pending: "border border-border text-muted-foreground",
  "not-observable": "border border-border text-muted-foreground",
};

export function StageDetailPanel({ stage, index }: { stage: RunStage; index: number }) {
  const def = STAGE_DEFS[index]!;
  const rows: { key: string; value: string }[] = [];
  if (stage.event?.detail) rows.push({ key: "detail", value: stage.event.detail });
  if (stage.event?.payload) {
    for (const [key, value] of Object.entries(stage.event.payload)) {
      rows.push({ key, value });
    }
  }
  if (stage.status === "not-observable") {
    rows.push({ key: "note", value: "This handoff happens outside care-loop-dashboard." });
  }

  return (
    <div className="animate-canvas-fade-up rounded-2xl border border-border bg-background p-5">
      <div className="mb-1 flex items-center gap-2.5">
        <span className="text-[15px] font-bold tracking-tight">{def.label}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", STATUS_BADGE[stage.status])}>
          {STATUS_LABEL[stage.status]}
        </span>
      </div>
      <div className="mb-4 font-mono text-[11px] text-muted-foreground">
        {def.method} {def.endpoint} · {def.method === "—" ? "not a dashboard event" : "fire-and-forget"}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Awaiting upstream stage — nothing received yet.</p>
      ) : (
        <div className="flex flex-col">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-3 border-t border-border/60 py-2 first:border-t-0"
            >
              <span className="font-mono text-[11.5px] text-muted-foreground">{row.key}</span>
              <span
                className={cn(
                  "truncate text-right font-mono text-[11.5px]",
                  stage.status === "pending" || stage.status === "not-observable"
                    ? "text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {row.value}
              </span>
            </div>
          ))}
          {stage.event ? (
            <div className="flex items-center justify-between gap-3 border-t border-border/60 py-2">
              <span className="font-mono text-[11.5px] text-muted-foreground">received_at</span>
              <span className="text-right font-mono text-[11.5px] text-foreground">
                {new Date(stage.event.receivedAt).toLocaleTimeString()}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
