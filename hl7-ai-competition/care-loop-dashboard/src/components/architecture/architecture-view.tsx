"use client";

import type { LucideIcon } from "lucide-react";

import type { ArchitectureBoxDef } from "@/lib/architecture";
import type { Run, StageStatus } from "@/lib/runs";

import {
  Bell,
  BrainCircuit,
  ClipboardCheck,
  Cpu,
  Database,
  FileText,
  MessageSquare,
  Smartphone,
  Stethoscope,
  User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ArchitectureDetailPanel } from "@/components/architecture/architecture-detail-panel";
import { ARCHITECTURE_BOXES } from "@/lib/architecture";
import { cn } from "@/lib/utils";

type BoxStatus = "done" | "active" | "pending";

const ICONS: Record<string, LucideIcon> = {
  "apple-health": Smartphone,
  "whatsapp-agent": MessageSquare,
  "ml-model": Cpu,
  "deterministic-rules": ClipboardCheck,
  "clinical-analysis-agent": BrainCircuit,
  "fhir-converter": FileText,
  "notification-ehr-integration": Bell,
  "front-desk": Stethoscope,
  patient: User,
  ehr: Database,
  doctor: User,
};

function boxOf(key: string): ArchitectureBoxDef {
  return ARCHITECTURE_BOXES.find((b) => b.key === key)!;
}

function statusOf(box: ArchitectureBoxDef, run: Run | undefined): BoxStatus {
  if (!run || box.stageKeys.length === 0) return "pending";
  const statuses: StageStatus[] = box.stageKeys.map(
    (key) => run.stages.find((s) => s.key === key)?.status ?? "pending",
  );
  if (statuses.every((s) => s === "done")) return "done";
  const anyActive = statuses.includes("active");
  const anyPending = statuses.some((s) => s === "pending" || s === "not-observable");
  if (anyActive && !anyPending) return "active";
  return "pending";
}

const NW = 96;
const NH = 96;
const WORLD_W = 2320;
const WORLD_H = 1160;

const NODE_POS: Record<string, { x: number; y: number }> = {
  patient: { x: 140, y: 480 },
  "apple-health": { x: 520, y: 300 },
  "whatsapp-agent": { x: 520, y: 660 },
  "ml-model": { x: 920, y: 200 },
  "deterministic-rules": { x: 920, y: 480 },
  "clinical-analysis-agent": { x: 920, y: 760 },
  "fhir-converter": { x: 1320, y: 480 },
  "notification-ehr-integration": { x: 1680, y: 480 },
  "front-desk": { x: 2040, y: 480 },
  doctor: { x: 2040, y: 180 },
  ehr: { x: 2040, y: 780 },
};

const cx = (k: string) => NODE_POS[k].x + NW / 2;
const cy = (k: string) => NODE_POS[k].y + NH / 2;
const R = (k: string) => `${NODE_POS[k].x + NW} ${cy(k)}`;
const L = (k: string) => `${NODE_POS[k].x} ${cy(k)}`;
const B = (k: string) => `${cx(k)} ${NODE_POS[k].y + NH}`;
const T = (k: string) => `${cx(k)} ${NODE_POS[k].y}`;

interface EdgeDef {
  d: string;
  dur: string;
  label?: string;
  lx?: number;
  ly?: number;
  strong?: boolean;
}

const EDGES: EdgeDef[] = [
  {
    d: `M${R("patient")} C 380 ${cy("patient")}, 380 ${cy("apple-health")}, ${L("apple-health")}`,
    dur: "3.4s",
  },
  {
    d: `M${R("patient")} C 380 ${cy("patient")}, 380 ${cy("whatsapp-agent")}, ${L("whatsapp-agent")}`,
    dur: "3.4s",
  },
  {
    d: `M${R("apple-health")} C 780 ${cy("apple-health")}, 780 ${cy("ml-model")}, ${L("ml-model")}`,
    label: "Predict / Evaluate",
    lx: 770,
    ly: 296,
    dur: "2.8s",
  },
  {
    d: `M${R("whatsapp-agent")} C 780 ${cy("whatsapp-agent")}, 780 ${cy("clinical-analysis-agent")}, ${L("clinical-analysis-agent")}`,
    dur: "3.2s",
  },
  { d: `M${B("ml-model")} L ${T("deterministic-rules")}`, dur: "2s" },
  { d: `M${B("deterministic-rules")} L ${T("clinical-analysis-agent")}`, dur: "2s" },
  {
    d: `M${R("clinical-analysis-agent")} C 1180 ${cy("clinical-analysis-agent")}, 1180 ${cy("fhir-converter")}, ${L("fhir-converter")}`,
    label: "Upon Alert",
    lx: 1170,
    ly: 664,
    dur: "3s",
    strong: true,
  },
  { d: `M${R("fhir-converter")} L ${L("notification-ehr-integration")}`, dur: "2.6s" },
  { d: `M${R("notification-ehr-integration")} L ${L("front-desk")}`, dur: "2.6s" },
  {
    d: `M${T("front-desk")} L ${B("doctor")}`,
    label: "Notify",
    lx: cx("front-desk"),
    ly: 378,
    dur: "2.4s",
  },
  { d: `M${B("front-desk")} L ${T("ehr")}`, dur: "2.4s" },
];

const ZONES = [
  { label: "PATIENT HOME", x: 140, y: 250 },
  { label: "DECISION ENGINE", x: 920, y: 150 },
  { label: "CARE LOOP", x: 1320, y: 250 },
  { label: "CLINIC", x: 2040, y: 130 },
];

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;

function Node({
  boxKey,
  run,
  selected,
  onSelect,
}: {
  boxKey: string;
  run?: Run;
  selected: boolean;
  onSelect?: (key: string) => void;
}) {
  const box = boxOf(boxKey);
  const pos = NODE_POS[boxKey];
  const Icon = ICONS[boxKey] ?? User;
  const status = statusOf(box, run);
  const clickable = Boolean(onSelect && !box.isActor);

  const tile = (
    <>
      <span className="absolute top-1/2 left-[-5px] h-[9px] w-[9px] -translate-y-1/2 rounded-full border-[1.5px] border-[rgba(0,0,0,0.3)] bg-[#f8f8f9]" />
      <span className="absolute top-1/2 right-[-5px] h-[9px] w-[9px] -translate-y-1/2 rounded-full border-[1.5px] border-[rgba(0,0,0,0.3)] bg-[#f8f8f9]" />
      <span className="arch-soft-pulse absolute top-[8px] right-[8px] h-[7px] w-[7px] rounded-full bg-[#16161a]" />
      <Icon className="h-[30px] w-[30px]" strokeWidth={1.7} />
    </>
  );

  const tileClass = cn(
    "relative box-border flex h-[96px] w-[96px] items-center justify-center rounded-[18px] border-[1.5px] border-[rgba(0,0,0,0.14)] bg-white text-[#16161a] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_22px_rgba(0,0,0,0.06)] transition-[border-color,box-shadow] duration-200",
    "hover:border-[rgba(0,0,0,0.4)] hover:shadow-[0_3px_6px_rgba(0,0,0,0.07),0_14px_30px_rgba(0,0,0,0.1)]",
    clickable ? "cursor-pointer" : "cursor-default",
    status === "active" && "border-[#16161a] animate-canvas-node-pulse",
    selected && "border-[#16161a]",
  );

  return (
    <div className="absolute z-[3]" style={{ left: pos.x, top: pos.y, width: NW }}>
      {clickable ? (
        <button type="button" onClick={() => onSelect!(boxKey)} className={tileClass}>
          {tile}
        </button>
      ) : (
        <div className={tileClass}>{tile}</div>
      )}
      <div className="mt-[10px] ml-[-47px] w-[190px] text-center">
        <div className="text-[12.5px] leading-tight font-bold tracking-[-0.1px] text-[#16161a]">
          {box.label}
        </div>
        {box.sublabel ? (
          <div className="mt-[3px] font-mono text-[9.5px] text-[rgba(0,0,0,0.45)]">
            {box.sublabel}
          </div>
        ) : null}
        {run && !box.isActor ? (
          <div
            className={cn(
              "mt-[3px] font-mono text-[9.5px]",
              status === "active" ? "text-[#16161a]" : "text-[rgba(0,0,0,0.45)]",
            )}
          >
            {status === "done" ? "Received" : status === "active" ? "Processing" : "Pending"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ArchitectureView({
  run,
  selectedBoxKey,
  onSelectBox,
}: {
  // Omitting run renders the structural, patient-agnostic diagram (home screen) - no per-stage received/pending status, no click-to-inspect.
  run?: Run;
  selectedBoxKey?: string | null;
  onSelectBox?: (key: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; sl: number; st: number } | null>(null);

  const centerCanvas = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      left: Math.max(0, (el.scrollWidth - el.clientWidth) / 2),
      top: Math.max(0, (el.scrollHeight - el.clientHeight) / 2),
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  const zoomBy = useCallback((f: number) => {
    const el = scrollRef.current;
    const z0 = zoomRef.current;
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z0 * f));
    if (z === z0) return;
    const cx0 = el ? (el.scrollLeft + el.clientWidth / 2) / z0 : 0;
    const cy0 = el ? (el.scrollTop + el.clientHeight / 2) / z0 : 0;
    zoomRef.current = z;
    setZoom(z);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el2 = scrollRef.current;
        if (!el2) return;
        el2.scrollTo({ left: cx0 * z - el2.clientWidth / 2, top: cy0 * z - el2.clientHeight / 2 });
      }),
    );
  }, []);

  const fit = useCallback(() => {
    zoomRef.current = 1;
    setZoom(1);
    requestAnimationFrame(() => requestAnimationFrame(() => centerCanvas(true)));
  }, [centerCanvas]);

  useEffect(() => {
    const t = setTimeout(centerCanvas, 60, false);
    return () => clearTimeout(t);
  }, [centerCanvas]);

  // Native non-passive listener: React's synthetic onWheel cannot preventDefault, so ctrl+scroll would zoom the whole page instead.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as Element).closest("button")) return;
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.setPointerCapture?.(e.pointerId);
    el.style.cursor = "grabbing";
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el) return;
    el.scrollLeft = d.sl - (e.clientX - d.sx);
    el.scrollTop = d.st - (e.clientY - d.sy);
  }

  function onPointerUp() {
    dragRef.current = null;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="relative overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.08)] bg-[#f8f8f9] shadow-[inset_0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="absolute top-[12px] left-[14px] z-10">
          <span className="rounded-[7px] border border-[rgba(0,0,0,0.08)] bg-[rgba(255,255,255,0.9)] px-[11px] py-[5px] text-[12px] font-bold whitespace-nowrap text-[#16161a]">
            System architecture
          </span>
        </div>

        <div className="absolute bottom-[12px] left-[14px] z-10">
          <span className="rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-[rgba(255,255,255,0.85)] px-[9px] py-[5px] text-[10.5px] whitespace-nowrap text-[rgba(0,0,0,0.45)]">
            Drag to pan · ⌃ scroll to zoom
          </span>
        </div>

        <div className="absolute top-[12px] right-[12px] z-10 flex gap-[6px]">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.25)}
            className="h-[28px] w-[28px] cursor-pointer rounded-[6px] border border-[rgba(0,0,0,0.12)] bg-white text-[14px] font-semibold text-[#16161a] shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:border-[#16161a] hover:bg-[#16161a] hover:text-white"
          >
            −
          </button>
          <span className="flex h-[28px] min-w-[44px] items-center justify-center rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-white font-mono text-[10.5px] text-[rgba(0,0,0,0.55)]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomBy(1.25)}
            className="h-[28px] w-[28px] cursor-pointer rounded-[6px] border border-[rgba(0,0,0,0.12)] bg-white text-[14px] font-semibold text-[#16161a] shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:border-[#16161a] hover:bg-[#16161a] hover:text-white"
          >
            +
          </button>
          <button
            type="button"
            onClick={fit}
            className="h-[28px] cursor-pointer rounded-[6px] border border-[rgba(0,0,0,0.12)] bg-white px-[12px] text-[11px] font-semibold text-[#16161a] shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:border-[#16161a] hover:bg-[#16161a] hover:text-white"
          >
            Fit
          </button>
        </div>

        <div
          ref={scrollRef}
          className="arch-flow-scroll h-[440px] cursor-grab overflow-auto"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div style={{ width: Math.round(WORLD_W * zoom), height: Math.round(WORLD_H * zoom) }}>
            <div
              className="run-dotted-grid relative"
              style={{
                width: WORLD_W,
                height: WORLD_H,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
              <svg
                width={WORLD_W}
                height={WORLD_H}
                className="pointer-events-none absolute inset-0 z-[1]"
              >
                <defs>
                  <marker
                    id="arch-arr"
                    viewBox="0 0 8 8"
                    refX={7}
                    refY={4}
                    markerWidth={7}
                    markerHeight={7}
                    orient="auto"
                  >
                    <path d="M0 0L8 4L0 8z" fill="rgba(0,0,0,0.35)" />
                  </marker>
                </defs>
                {EDGES.map((e, i) => (
                  <g key={e.d}>
                    <path
                      d={e.d}
                      fill="none"
                      stroke={e.strong ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.22)"}
                      strokeWidth={e.strong ? 2.5 : 1.5}
                      markerEnd="url(#arch-arr)"
                    />
                    <circle r={4.5} fill="#16161a">
                      <animateMotion
                        dur={e.dur}
                        repeatCount="indefinite"
                        path={e.d}
                        keyPoints="0;1"
                        keyTimes="0;1"
                        calcMode="linear"
                      />
                    </circle>
                    <circle r={2.5} fill="rgba(0,0,0,0.45)">
                      <animateMotion
                        dur={e.dur}
                        begin={`${(i * 0.35 + 0.8).toFixed(2)}s`}
                        repeatCount="indefinite"
                        path={e.d}
                        keyPoints="0;1"
                        keyTimes="0;1"
                        calcMode="linear"
                      />
                    </circle>
                  </g>
                ))}
              </svg>

              {EDGES.filter((e) => e.label).map((e) => (
                <div
                  key={e.label}
                  className="absolute z-[4] -translate-x-1/2 -translate-y-1/2"
                  style={{ left: e.lx, top: e.ly }}
                >
                  <span className="rounded-[6px] border border-[rgba(0,0,0,0.12)] bg-white px-[7px] py-[2px] font-mono text-[9.5px] whitespace-nowrap text-[rgba(0,0,0,0.6)] shadow-[0_3px_10px_rgba(0,0,0,0.07)]">
                    {e.label}
                  </span>
                </div>
              ))}

              {ARCHITECTURE_BOXES.map((box) => (
                <Node
                  key={box.key}
                  boxKey={box.key}
                  run={run}
                  selected={selectedBoxKey === box.key}
                  onSelect={onSelectBox}
                />
              ))}

              {ZONES.map((z) => (
                <div
                  key={z.label}
                  className="absolute z-[2] text-[10px] font-bold tracking-[0.1em] text-[rgba(0,0,0,0.3)]"
                  style={{ left: z.x, top: z.y }}
                >
                  {z.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedBoxKey && run ? <ArchitectureDetailPanel box={boxOf(selectedBoxKey)} run={run} /> : null}
    </div>
  );
}
