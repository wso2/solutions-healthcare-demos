"use client";

import type { HomePatientRow, HomeSummary } from "@/app/api/home-summary/route";
import type { OpsPatient } from "@/app/api/patients/route";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ArchitectureView } from "@/components/architecture/architecture-view";
import { Skeleton } from "@/components/ui/skeleton";
import { statusBand } from "@/lib/status-band";

const PAGE_SIZE = 5;

const ROW_GRID = "grid grid-cols-[1.6fr_110px_1fr_1fr_0.8fr_1.2fr_46px] gap-3";

const PAGER_BUTTON =
  "cursor-pointer rounded-[7px] border border-[rgba(0,0,0,0.14)] bg-white px-3 py-[5px] text-[11px] font-semibold text-[#16161a] hover:border-accent-brand hover:bg-accent-brand hover:text-white disabled:pointer-events-none disabled:text-[rgba(0,0,0,0.25)]";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

// lastActivity is a bare timestamp (no event descriptor), so render absolute HH:MM without fabricating a label.
function formatActivityTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

interface KpiTile {
  label: string;
  value: string;
  sub: string;
}

// Band derives from open-Task existence - the FHIR record of the escalation decision - like every view.
function bandForRow(row: HomePatientRow | undefined) {
  return statusBand((row?.openTasks ?? 0) > 0);
}

function buildKpis(summary: HomeSummary, loaded: boolean, error: boolean): KpiTile[] {
  // A degraded summary must not read as authoritative zeros.
  if (error) {
    return ["Total patients", "Open tasks", "Escalations today", "Avg ML risk", "Latest event"].map((label) => ({
      label,
      value: "—",
      sub: "care-loop-fhir-server unreachable",
    }));
  }
  if (!loaded) {
    return [
      { label: "Total patients", value: "…", sub: "" },
      { label: "Open tasks", value: "…", sub: "" },
      { label: "Escalations today", value: "…", sub: "" },
      { label: "Avg ML risk", value: "…", sub: "" },
      { label: "Latest event", value: "…", sub: "" },
    ];
  }
  return [
    { label: "Total patients", value: String(summary.totalPatients), sub: "enrolled in remote monitoring" },
    { label: "Open tasks", value: String(summary.openTasks), sub: "across all patients" },
    { label: "Escalations today", value: String(summary.escalationsToday), sub: "Tasks created/updated today" },
    {
      label: "Avg ML risk",
      value: summary.avgMlRisk === null ? "—" : summary.avgMlRisk.toFixed(2),
      sub: "latest heart-risk-service prediction",
    },
    {
      label: "Latest event",
      value: summary.latestEvent ? new Date(summary.latestEvent).toLocaleTimeString([], { hour12: false }) : "—",
      sub: "most recent dashboard event",
    },
  ];
}

export function HomeView({
  patients,
  patientsLoaded,
  patientsError = false,
  summary,
  summaryLoaded,
  summaryError = false,
  onSelect,
}: {
  patients: OpsPatient[];
  patientsLoaded: boolean;
  patientsError?: boolean;
  summary: HomeSummary;
  summaryLoaded: boolean;
  summaryError?: boolean;
  onSelect: (patient: OpsPatient) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const rowByPatientId = useMemo(
    () => new Map(summary.patients.map((row) => [row.id, row])),
    [summary.patients],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((patient) => {
      if (patient.name.toLowerCase().includes(q) || patient.id.toLowerCase().includes(q)) return true;
      const band = bandForRow(rowByPatientId.get(patient.id));
      return band !== null && band.label.toLowerCase().includes(q);
    });
  }, [patients, query, rowByPatientId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);
  const pageInfo =
    filtered.length === 0
      ? "No results"
      : `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length} · page ${currentPage + 1} / ${totalPages}`;

  const kpis = buildKpis(summary, summaryLoaded, summaryError);

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-5 px-4 pt-7 pb-[72px] md:px-6">
      <div className="mt-1">
        <h1 className="text-[22px] font-bold tracking-[-0.4px]">Patients</h1>
        <p className="mt-[5px] text-[13px] text-[rgba(0,0,0,0.5)]">
          {patientsLoaded ? `${patients.length} enrolled in remote monitoring` : "Loading enrolled patients…"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-[13px] border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3.5">
            <div className="text-[10.5px] font-semibold tracking-[0.06em] text-[rgba(0,0,0,0.42)] uppercase">
              {kpi.label}
            </div>
            <div className="mt-[6px] font-mono text-[22px] font-bold tracking-[-0.4px]">{kpi.value}</div>
            <div className="mt-[3px] text-[11px] text-[rgba(0,0,0,0.42)]">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-[rgba(0,0,0,0.06)] px-5 py-[13px]">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold tracking-[-0.2px]">Patients</span>
            <span className="rounded-[20px] bg-accent-brand px-2 py-0.5 text-[10.5px] font-bold text-white">
              {filtered.length}
            </span>
          </div>
          <div className="relative w-[min(320px,50%)]">
            <Search className="absolute top-1/2 left-3 size-[13px] -translate-y-1/2 text-[rgba(0,0,0,0.4)]" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search name, MRN or status…"
              className="w-full rounded-[9px] border border-[rgba(0,0,0,0.1)] bg-[rgba(0,0,0,0.025)] py-2 pr-[30px] pl-[34px] text-[12.5px] text-[#16161a] outline-none focus:border-accent-brand focus:bg-white"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 flex size-[18px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-[5px] bg-[rgba(0,0,0,0.06)] text-[9px] text-[rgba(0,0,0,0.55)] hover:bg-accent-brand hover:text-white"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>

        <div
          className={`${ROW_GRID} border-b border-[rgba(0,0,0,0.06)] bg-[rgba(0,0,0,0.015)] px-5 py-2.5 text-[10.5px] font-semibold tracking-[0.05em] text-[rgba(0,0,0,0.4)] uppercase`}
        >
          <span>Patient</span>
          <span>Status</span>
          <span>Latest HR</span>
          <span>ML risk</span>
          <span>Tasks</span>
          <span>Last activity</span>
          <span />
        </div>

        {!patientsLoaded ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : pageRows.length === 0 ? (
          <div className="px-5 py-7 text-center">
            <div className="text-[12.5px] font-semibold text-[rgba(0,0,0,0.55)]">
              {query
                ? `No patients match “${query}”`
                : patientsError
                  ? "care-loop-fhir-server unreachable — patient list unavailable."
                  : "No patients found on care-loop-fhir-server."}
            </div>
            {query ? (
              <div className="mt-[3px] text-[11.5px] text-[rgba(0,0,0,0.4)]">Try a name or MRN fragment.</div>
            ) : null}
          </div>
        ) : (
          pageRows.map((patient) => {
            const row: HomePatientRow | undefined = rowByPatientId.get(patient.id);
            const band = bandForRow(row);
            return (
              <button
                key={patient.id}
                type="button"
                onClick={() => onSelect(patient)}
                className={`${ROW_GRID} w-full cursor-pointer items-center border-t border-[rgba(0,0,0,0.05)] px-5 py-3 text-left hover:bg-[rgba(0,0,0,0.02)]`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-[rgba(0,0,0,0.06)] text-[10px] font-bold text-[rgba(0,0,0,0.6)]">
                    {initials(patient.name)}
                  </span>
                  <span className="truncate text-[13px] font-semibold">{patient.name}</span>
                </span>
                <span>
                  {band ? (
                    <span className="rounded-[20px] px-[9px] py-[3px] text-[10.5px] font-semibold" style={band.style}>
                      {band.label}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[12px]">
                  {row?.latestHr !== undefined && row?.latestHr !== null ? `${row.latestHr} bpm` : "—"}
                </span>
                <span className="font-mono text-[12px]">
                  {row?.mlRisk !== undefined && row?.mlRisk !== null ? row.mlRisk.toFixed(2) : "—"}
                </span>
                <span className="font-mono text-[12px]">{row?.openTasks ?? "—"}</span>
                <span className="text-[12px] text-[rgba(0,0,0,0.55)]">
                  {row ? formatActivityTime(row.lastActivity) : "—"}
                </span>
                <span className="text-right text-[13px] text-[rgba(0,0,0,0.35)]">→</span>
              </button>
            );
          })
        )}

        <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] px-5 py-2.5">
          <span className="text-[11.5px] text-[rgba(0,0,0,0.45)]">{pageInfo}</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className={PAGER_BUTTON}
            >
              ← Prev
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className={PAGER_BUTTON}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      <ArchitectureView />
    </div>
  );
}
