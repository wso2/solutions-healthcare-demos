"use client";

import type { RiskAssessmentSummary } from "@/app/api/patients/[id]/risk-assessments/route";
import type { ObservationDto } from "@/lib/vitals";

import { compactUnit, groupIntoRows, HEART_RATE_LOINC, loincCode, SPO2_LOINC } from "@/lib/vitals";

function formatProbability(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" });
}

interface Tile {
  label: string;
  value: string;
  sub: string;
  dim?: boolean;
}

export function PatientMetrics({
  observations,
  mlPredictions,
  agenticPredictions,
  openTaskCount,
  openTaskPriority = null,
}: {
  observations: ObservationDto[];
  mlPredictions: RiskAssessmentSummary[];
  agenticPredictions: RiskAssessmentSummary[];
  openTaskCount: number;
  // Highest-priority open Task's FHIR priority code ("stat", "urgent", ...); optional so the page can wire it in without breaking existing call sites.
  openTaskPriority?: string | null;
}) {
  const latestRow = groupIntoRows(observations)[0] ?? null;
  const latestHrObservation = observations.find((o) => loincCode(o) === HEART_RATE_LOINC) ?? null;
  const latestSpo2Observation = observations.find((o) => loincCode(o) === SPO2_LOINC) ?? null;
  const latestMl = mlPredictions[0];
  const latestAgentic = agenticPredictions[0];
  const agenticRisk = latestAgentic?.predictions[0]?.qualitativeRisk ?? null;

  const tiles: Tile[] = [
    {
      label: "Heart rate",
      value: latestHrObservation?.value ?? "—",
      sub: latestHrObservation?.effectiveDateTime
        ? `${compactUnit(latestHrObservation.unit ?? "bpm")} · ${formatTime(latestHrObservation.effectiveDateTime)}`
        : "no reading yet",
    },
    {
      label: "Blood pressure",
      value:
        latestRow?.systolic?.value && latestRow.diastolic?.value
          ? `${latestRow.systolic.value}/${latestRow.diastolic.value}`
          : "—",
      sub: "mmHg",
    },
    {
      label: "SpO₂",
      value: latestSpo2Observation?.value != null ? `${latestSpo2Observation.value}%` : "—",
      sub: latestSpo2Observation?.effectiveDateTime
        ? formatTime(latestSpo2Observation.effectiveDateTime)
        : "no reading yet",
    },
    {
      label: "ML risk",
      value: formatProbability(latestMl?.predictions[0]?.probability),
      sub: latestMl ? (latestMl.method ?? "latest ML prediction") : "no prediction yet",
    },
    {
      label: "Agent risk",
      value: formatProbability(latestAgentic?.predictions[0]?.probability),
      sub: latestAgentic ? (agenticRisk ? agenticRisk.toUpperCase() : "latest agentic assessment") : "not run",
      dim: !latestAgentic,
    },
    {
      label: "Open tasks",
      value: String(openTaskCount),
      sub: openTaskCount > 0 ? (openTaskPriority ? `priority ${openTaskPriority}` : "requiring review") : "none",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-[13px] border border-[rgba(0,0,0,0.08)] bg-white px-[15px] py-[13px]">
          <div className="text-[10px] font-semibold tracking-[0.06em] text-[rgba(0,0,0,0.42)] uppercase">
            {tile.label}
          </div>
          <div
            className="mt-[5px] font-mono text-[19px] font-bold tracking-[-0.3px]"
            style={{ color: tile.dim ? "rgba(0,0,0,0.4)" : "#16161a" }}
          >
            {tile.value}
          </div>
          <div className="mt-0.5 text-[10.5px] text-[rgba(0,0,0,0.42)]">{tile.sub}</div>
        </div>
      ))}
    </div>
  );
}
