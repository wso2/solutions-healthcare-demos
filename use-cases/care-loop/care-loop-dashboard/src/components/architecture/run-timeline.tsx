"use client";

import type { Run, RunStage } from "@/lib/runs";

import {
  Activity,
  Bell,
  ClipboardCheck,
  Cpu,
  MessageSquare,
  Send,
  Sparkles,
  Stethoscope,
} from "lucide-react";

import { useRef, useState } from "react";
import { OUTCOME_BELOW_THRESHOLD } from "@/lib/runs";

import { STAGE_DEFS } from "@/lib/stages";
import { compactUnit } from "@/lib/vitals";

const STAGE_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  vitals: Activity,
  ml: Cpu,
  escalation: ClipboardCheck,
  quest: Sparkles,
  sent: Send,
  respond: MessageSquare,
  agentic_draft: Sparkles,
  agentic: Sparkles,
  task_desc: ClipboardCheck,
  fhir: Bell,
  clinician: Stethoscope,
};

// A settled run renders its unreached tail as ended, not perpetual Pending.
type DisplayStatus = RunStage["status"] | "ended";

const STATUS_LABEL: Record<DisplayStatus, string> = {
  done: "Done",
  active: "Processing",
  pending: "Pending",
  "not-observable": "Not observable",
  ended: "Run ended",
};

const BADGE_LABEL: Record<DisplayStatus, string> = {
  done: "Received",
  active: "Processing",
  pending: "Pending",
  "not-observable": "Not observable",
  ended: "Run ended",
};

function roundedNumber(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(2) : raw;
}

const CONNECTOR_CHIP_BUILDERS: Record<string, (payload: Record<string, string>) => string | null> = {
  vitals: (p) => (p.value ? (p.unit ? `${p.value} ${compactUnit(p.unit)}` : p.value) : null),
  ml: (p) => (p.probability ? `probability ${roundedNumber(p.probability)}` : null),
  escalation: (p) => (p.threshold ? `threshold ${roundedNumber(p.threshold)}` : null),
  quest: (p) => (p.itemCount ? `${p.itemCount} item(s)` : null),
  sent: (p) => (p.status ? p.status : null),
  respond: (p) => (p.answerCount ? `${p.answerCount} answer(s)` : null),
  agentic_draft: (p) => (p.probability ? `probability ${roundedNumber(p.probability)}` : null),
  agentic: (p) => (p.probability ? `probability ${roundedNumber(p.probability)}` : null),
  fhir: (p) => (p.priority ? `priority ${p.priority}` : null),
};

function connectorChip(stage: RunStage): string | null {
  if (stage.status !== "done" || !stage.event?.payload) return null;
  return CONNECTOR_CHIP_BUILDERS[stage.key]?.(stage.event.payload) ?? null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" });
}

const RW = 88;
const RH = 88;
const PX = 290;
const PY = 200;
const RSX = 90;
const RSY = 64;
const PER = 4;
const CANVAS_MIN_W = 1180;
const PANEL_W = 270;

function rpos(i: number): { left: number; top: number; row: number } {
  const row = Math.floor(i / PER);
  const c = i % PER;
  const col = row % 2 === 0 ? c : PER - 1 - c;
  return { left: RSX + col * PX, top: RSY + row * PY, row };
}

const CHIP_BASE =
  "absolute rounded-[6px] border border-[rgba(0,0,0,0.12)] bg-white px-[7px] py-[2px] font-mono text-[9.5px] whitespace-nowrap text-[rgba(0,0,0,0.6)] shadow-[0_3px_10px_rgba(0,0,0,0.07)] z-[5]";

function Connector({ from, to, done, chip }: { from: number; to: number; done: boolean; chip: string | null }) {
  const a = rpos(from);
  const b = rpos(to);
  if (a.row === b.row) {
    const lx = Math.min(a.left, b.left) + RW;
    const w = Math.max(a.left, b.left) - lx;
    const rev = a.left > b.left;
    return (
      <div
        className="absolute z-[1] h-[2px] rounded-[2px]"
        style={{
          left: lx,
          top: a.top + RH / 2 - 1,
          width: w,
          background: done
            ? "linear-gradient(90deg, rgba(0,0,0,0.35), rgba(0,0,0,0.15))"
            : "rgba(0,0,0,0.09)",
        }}
      >
        {done ? (
          <div
            className="animate-run-dot-h absolute top-1/2 size-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-brand shadow-[0_0_8px_1px_rgba(255,115,0,0.5)]"
            style={rev ? { animationDirection: "reverse" } : undefined}
          />
        ) : null}
        {chip ? <span className={`${CHIP_BASE} -top-[26px] left-1/2 -translate-x-1/2`}>{chip}</span> : null}
      </div>
    );
  }
  const x = a.left + RW / 2;
  const ty = a.top + RH + 62;
  const h = b.top - ty;
  return (
    <div
      className="absolute z-[1] w-[2px] rounded-[2px]"
      style={{
        left: x - 1,
        top: ty,
        height: h,
        background: done
          ? "linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.15))"
          : "rgba(0,0,0,0.09)",
      }}
    >
      {done ? (
        <div className="animate-run-dot absolute left-1/2 size-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-brand shadow-[0_0_8px_1px_rgba(255,115,0,0.5)]" />
      ) : null}
      {chip ? <span className={`${CHIP_BASE} top-1/2 left-[14px] -translate-y-1/2`}>{chip}</span> : null}
    </div>
  );
}

interface NodeLook {
  border: string;
  iconStyle: React.CSSProperties;
  titleColor: string;
  cardOpacity: number;
  stateColor: string;
}

function nodeLook(status: DisplayStatus): NodeLook {
  if (status === "active") {
    return {
      border: "1.5px solid #16161a",
      iconStyle: { background: "#fff", color: "#16161a" },
      titleColor: "#16161a",
      cardOpacity: 1,
      stateColor: "#16161a",
    };
  }
  if (status === "done") {
    return {
      border: "1.5px solid rgba(0,0,0,0.11)",
      iconStyle: { background: "#16161a", color: "#fff" },
      titleColor: "#16161a",
      cardOpacity: 1,
      stateColor: "rgba(0,0,0,0.45)",
    };
  }
  if (status === "ended") {
    return {
      border: "1.5px dashed rgba(0,0,0,0.25)",
      iconStyle: { background: "transparent", color: "rgba(0,0,0,0.4)" },
      titleColor: "rgba(0,0,0,0.55)",
      cardOpacity: 1,
      stateColor: "rgba(0,0,0,0.45)",
    };
  }
  return {
    border: "1px solid rgba(0,0,0,0.07)",
    iconStyle: { background: "rgba(0,0,0,0.04)", color: "rgba(0,0,0,0.3)" },
    titleColor: "rgba(0,0,0,0.45)",
    cardOpacity: 0.8,
    stateColor: "rgba(0,0,0,0.35)",
  };
}

function inspectorBadgeStyle(status: DisplayStatus): React.CSSProperties {
  if (status === "done") return { background: "rgba(0,0,0,0.08)", color: "rgba(0,0,0,0.65)" };
  if (status === "active") return { background: "#16161a", color: "#fff" };
  return { background: "transparent", color: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,0,0,0.14)" };
}

export function RunTimeline({ run }: { run: Run }) {
  const [selected, setSelected] = useState<number | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = Math.ceil(run.stages.length / PER);
  const canvasH = RSY + (rows - 1) * PY + RH + 110;

  // A run settled below threshold has nothing more coming (lib/runs.ts outcome logic), so its unreached tail renders as ended, not pending.
  const runEnded = run.outcome === OUTCOME_BELOW_THRESHOLD;
  let lastDoneIndex = -1;
  run.stages.forEach((s, i) => {
    if (s.status === "done") lastDoneIndex = i;
  });
  function displayStatus(stage: RunStage, i: number): DisplayStatus {
    if (runEnded && i > lastDoneIndex && stage.status !== "done" && stage.status !== "active") return "ended";
    return stage.status;
  }

  const selStage = selected !== null ? run.stages[selected] : null;
  const selDef = selected !== null ? STAGE_DEFS[selected] : null;
  const payloadRows: { k: string; v: string }[] = [];
  if (selStage) {
    if (selStage.event?.detail) payloadRows.push({ k: "detail", v: selStage.event.detail });
    if (selStage.event?.payload) {
      for (const [k, v] of Object.entries(selStage.event.payload)) {
        // Round long numerics (16-decimal probabilities) for display; never lengthen short values like "6".
        const rounded = roundedNumber(v);
        payloadRows.push({ k, v: rounded.length < v.length ? rounded : v });
      }
    }
    if (selStage.status === "not-observable") {
      payloadRows.push({ k: "note", v: "Happens outside this dashboard." });
    }
    if (selStage.event) {
      payloadRows.push({ k: "received_at", v: new Date(selStage.event.receivedAt).toLocaleTimeString([], { hour12: false }) });
    }
  }
  const selDisplay = selStage !== null && selected !== null ? displayStatus(selStage, selected) : null;
  const selPos = selected !== null ? rpos(selected) : null;
  const panelLeft = selPos
    ? selPos.left + RW + 16 + PANEL_W <= CANVAS_MIN_W
      ? selPos.left + RW + 16
      : selPos.left - PANEL_W - 16
    : 0;

  function enter(i: number) {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setSelected(i);
  }
  function leave() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(setSelected, 120, null);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#f8f8f9] shadow-[inset_0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="absolute top-3 left-3.5 z-10">
        <span className="rounded-[7px] border border-[rgba(0,0,0,0.08)] bg-white/90 px-[11px] py-[5px] text-[12px] font-bold whitespace-nowrap text-[#16161a]">
          Latest run
        </span>
      </div>
      <div className="absolute top-3 right-3.5 z-10 flex items-center gap-1.5">
        <span className="rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white/85 px-[9px] py-[5px] font-mono text-[10px] whitespace-nowrap text-[rgba(0,0,0,0.45)]">
          triggered by vitals · {formatTime(run.startedAt)} · {run.outcome}
        </span>
        {runEnded ? (
          <span className="rounded-[6px] border border-[rgba(22,128,61,0.28)] bg-[#f2faf4]/90 px-[9px] py-[5px] font-mono text-[10px] whitespace-nowrap text-[#15803d]">
            ✓ no escalation needed
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <div className="run-dotted-grid relative" style={{ height: canvasH, minWidth: CANVAS_MIN_W }}>
          {run.stages.slice(0, -1).map((stage, i) => (
            <Connector
              key={`conn-${stage.key}`}
              from={i}
              to={i + 1}
              done={stage.status === "done"}
              chip={connectorChip(stage)}
            />
          ))}

          {run.stages.map((stage, i) => {
            const def = STAGE_DEFS[i]!;
            const Icon = STAGE_ICONS[stage.key] ?? Cpu;
            const status = displayStatus(stage, i);
            const look = nodeLook(status);
            const pos = rpos(i);
            const isSelected = selected === i;
            const showMethod = (status === "done" || status === "active") && def.method !== "—";
            // Only done/active nodes recolor their selected border; pending/ended keep their own.
            const border =
              isSelected && (status === "done" || status === "active")
                ? `1.5px solid ${status === "active" ? "#16161a" : "rgba(0,0,0,0.45)"}`
                : look.border;
            const subtitle =
              def.method === "—" ? `${def.service} · internal decision` : `${def.service} · ${def.method} ${def.endpoint}`;
            return (
              <div
                key={stage.key}
                onMouseEnter={() => enter(i)}
                onMouseLeave={leave}
                className="absolute z-[2] cursor-pointer"
                style={{ left: pos.left, top: pos.top, width: RW, opacity: look.cardOpacity }}
              >
                <div
                  className="relative box-border flex items-center justify-center rounded-[18px] transition-[border-color,box-shadow] duration-200"
                  style={{
                    width: RW,
                    height: RH,
                    border,
                    boxShadow: isSelected
                      ? "0 0 0 3px rgba(0,0,0,0.08), 0 10px 26px rgba(0,0,0,0.1)"
                      : "0 1px 2px rgba(0,0,0,0.04), 0 8px 20px rgba(0,0,0,0.05)",
                    ...look.iconStyle,
                  }}
                >
                  <span className="absolute top-1/2 -left-[5px] size-[9px] -translate-y-1/2 rounded-full border-[1.5px] border-[rgba(0,0,0,0.3)] bg-[#f8f8f9]" />
                  <span className="absolute top-1/2 -right-[5px] size-[9px] -translate-y-1/2 rounded-full border-[1.5px] border-[rgba(0,0,0,0.3)] bg-[#f8f8f9]" />
                  {showMethod ? (
                    <span className="absolute -top-[9px] left-1/2 -translate-x-1/2 rounded-[5px] bg-accent-brand px-1.5 py-px font-mono text-[8.5px] font-semibold text-white">
                      {def.method}
                    </span>
                  ) : null}
                  {stage.status === "active" ? (
                    <div className="absolute -right-[7px] -bottom-[7px] size-4 animate-spin rounded-full border-[1.5px] border-accent-brand border-t-transparent bg-white [animation-duration:0.9s]" />
                  ) : null}
                  <Icon size={26} strokeWidth={2} />
                </div>
                <div className="mt-2.5 text-center" style={{ width: 220, marginLeft: -66 }}>
                  <div className="text-[12.5px] font-bold tracking-[-0.1px]" style={{ color: look.titleColor }}>
                    {def.label}
                  </div>
                  <div className="mt-[3px] overflow-hidden font-mono text-[9px] text-ellipsis whitespace-nowrap text-[rgba(0,0,0,0.42)]">
                    {subtitle}
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-1.5">
                    <span className="text-[10.5px] font-semibold" style={{ color: look.stateColor }}>
                      {STATUS_LABEL[status]}
                    </span>
                    {stage.event ? (
                      <span className="font-mono text-[9.5px] text-[rgba(0,0,0,0.38)]">
                        {formatTime(stage.event.receivedAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          {selStage && selDef && selPos ? (
            <div
              onMouseEnter={() => enter(selected!)}
              onMouseLeave={leave}
              className="animate-canvas-fade-up absolute z-[6] rounded-[14px] border border-[rgba(0,0,0,0.14)] bg-white shadow-[0_14px_40px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.06)]"
              style={{ left: panelLeft, top: selPos.top, width: PANEL_W }}
            >
              <div className="flex items-center gap-2 px-[15px] pt-[13px]">
                <span className="text-[13px] font-bold tracking-[-0.2px]">{selDef.label}</span>
                <span
                  className="rounded-[20px] px-[9px] py-0.5 text-[10.5px] font-semibold"
                  style={inspectorBadgeStyle(selDisplay ?? selStage.status)}
                >
                  {BADGE_LABEL[selDisplay ?? selStage.status]}
                </span>
              </div>
              <div className="border-b border-[rgba(0,0,0,0.06)] px-[15px] pt-[3px] pb-[9px] font-mono text-[9.5px] text-[rgba(0,0,0,0.42)]">
                {selDef.method === "—" ? selDef.service : `${selDef.service} · ${selDef.method} ${selDef.endpoint}`}
              </div>
              <div className="flex flex-col px-[15px] pt-1 pb-[11px]">
                {payloadRows.length === 0 ? (
                  <div className="py-1.5 font-mono text-[10.5px] text-[rgba(0,0,0,0.45)]">
                    Awaiting upstream stage — nothing received yet.
                  </div>
                ) : (
                  payloadRows.map((row) => (
                    <div
                      key={row.k}
                      className="flex items-center justify-between gap-3.5 border-b border-[rgba(0,0,0,0.04)] py-1.5"
                    >
                      <span className="font-mono text-[10.5px] text-[rgba(0,0,0,0.45)]">{row.k}</span>
                      <span className="text-right font-mono text-[10.5px] break-all text-[#16161a]">{row.v}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
