"use client";

import type { HomePatientRow } from "@/app/api/home-summary/route";
import type { OpsPatient } from "@/app/api/patients/route";

import { useEffect, useMemo, useRef, useState } from "react";

import { statusBand } from "@/lib/status-band";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

function bandForRow(row: HomePatientRow | undefined) {
  return statusBand((row?.openTasks ?? 0) > 0);
}

function patientMeta(patient: OpsPatient): string {
  const sex = patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : "Unknown sex";
  return patient.birthDate ? `${sex} · ${patient.birthDate}` : sex;
}

export function CommandPalette({
  patients,
  summaryRows,
  onSelect,
  onClose,
}: {
  patients: OpsPatient[];
  summaryRows: HomePatientRow[];
  onSelect: (patient: OpsPatient) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);

  const rowByPatientId = useMemo(() => new Map(summaryRows.map((row) => [row.id, row])), [summaryRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((patient) => {
      if (patient.name.toLowerCase().includes(q) || patient.id.toLowerCase().includes(q)) return true;
      const band = bandForRow(rowByPatientId.get(patient.id));
      return band !== null && band.label.toLowerCase().includes(q);
    });
  }, [patients, query, rowByPatientId]);

  const active = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex(Math.min(active + 1, Math.max(0, filtered.length - 1)));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(Math.max(active - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const hit = filtered[active];
        if (hit) onSelect(hit);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, active, onClose, onSelect]);

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-[rgba(20,20,24,0.3)] backdrop-blur-[10px]"
      />
      {/* Inline transform (not a translate utility): the paletteIn keyframes animate transform incl. translateX(-50%), and Tailwind's translate property would compose with it. */}
      <div
        className="animate-palette-in fixed top-[14vh] left-1/2 z-[61] w-[min(620px,92vw)]"
        style={{ transform: "translateX(-50%)" }}
      >
        <div className="overflow-hidden rounded-[18px] border border-[rgba(0,0,0,0.1)] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.3),0_4px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-3 border-b border-[rgba(0,0,0,0.07)] px-[18px] py-4">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(0,0,0,0.45)"
              strokeWidth="2"
              strokeLinecap="round"
              className="shrink-0"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              placeholder="Search by name, MRN or status…"
              className="flex-1 border-none bg-transparent text-[15px] text-[#16161a] outline-none"
            />
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-[5px] border border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.04)] px-[7px] py-[3px] font-mono text-[10px] font-semibold text-[rgba(0,0,0,0.45)] hover:border-accent-brand hover:bg-accent-brand hover:text-white"
            >
              esc
            </button>
          </div>
          <div className="max-h-[52vh] overflow-y-auto p-2">
            {query.trim() && filtered.length === 0 ? (
              <div className="px-5 py-7 text-center">
                <div className="text-[13px] font-semibold text-[rgba(0,0,0,0.55)]">
                  No patients match “{query}”
                </div>
                <div className="mt-1 text-[12px] text-[rgba(0,0,0,0.4)]">Try a name or MRN fragment.</div>
              </div>
            ) : (
              filtered.map((patient, index) => {
                const row = rowByPatientId.get(patient.id);
                const band = bandForRow(row);
                return (
                  <button
                    key={patient.id}
                    ref={index === active ? activeRowRef : undefined}
                    type="button"
                    onClick={() => onSelect(patient)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-[13px] rounded-[11px] px-3 py-[11px] text-left",
                      index === active && "bg-[rgba(0,0,0,0.045)]",
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-brand text-[12px] font-bold text-white">
                      {initials(patient.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold">{patient.name}</span>
                      <span className="mt-px block truncate font-mono text-[10.5px] text-[rgba(0,0,0,0.42)]">
                        {patientMeta(patient)} · Patient/{patient.id}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-[11.5px] font-semibold">
                        {row?.latestHr !== undefined && row?.latestHr !== null ? `${row.latestHr} bpm` : "—"}
                      </span>
                      <span className="block font-mono text-[10px] text-[rgba(0,0,0,0.42)]">
                        risk {row?.mlRisk !== undefined && row?.mlRisk !== null ? row.mlRisk.toFixed(2) : "—"}
                      </span>
                    </span>
                    {band ? (
                      <span className="rounded-[20px] px-[9px] py-[3px] text-[10.5px] font-semibold" style={band.style}>
                        {band.label}
                      </span>
                    ) : null}
                    <span className="text-[13px] text-[rgba(0,0,0,0.3)]">→</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex gap-4 border-t border-[rgba(0,0,0,0.06)] px-[18px] py-[9px] text-[10.5px] text-[rgba(0,0,0,0.4)]">
            <span>
              <b className="font-semibold">↵</b> open highlighted
            </span>
            <span>
              <b className="font-semibold">esc</b> close
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
