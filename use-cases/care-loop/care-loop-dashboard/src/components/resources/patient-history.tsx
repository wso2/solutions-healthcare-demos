"use client";

import type {
  AllergySummary,
  BaselineObservationSummary,
  ConditionSummary,
  EncounterSummary,
  MedicationSummary,
} from "@/app/api/patients/[id]/history/route";
import type { OpsPatient } from "@/app/api/patients/route";

import { useEffect, useState } from "react";

import { FhirButton } from "@/components/resources/fhir-drawer";
import { Skeleton } from "@/components/ui/skeleton";

const HISTORY_POLL_INTERVAL_MS = 1_000;

interface HistoryData {
  conditions: ConditionSummary[];
  medications: MedicationSummary[];
  allergies: AllergySummary[];
  encounters: EncounterSummary[];
  baselineObservations: BaselineObservationSummary[];
}

interface RecordRow {
  key: string;
  name: string;
  sub: string | null;
  fhir: { resourcePath: string; raw: unknown; server?: "care-loop" | "ehr" } | null;
}

function RecordSection({
  title,
  rtype,
  rows,
  emptyText = "None recorded.",
}: {
  title: string;
  rtype: string;
  rows: RecordRow[];
  emptyText?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] bg-[rgba(0,0,0,0.02)] px-3.5 py-2.5">
        <span className="text-[11px] font-bold tracking-[0.06em] text-[rgba(0,0,0,0.55)] uppercase">{title}</span>
        <span className="font-mono text-[9.5px] text-[rgba(0,0,0,0.38)]">{rtype}</span>
      </div>
      <div className="flex flex-col">
        {rows.length === 0 ? (
          <div className="p-3.5 text-[11.5px] text-[rgba(0,0,0,0.4)]">{emptyText}</div>
        ) : (
          rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-2.5 border-t border-[rgba(0,0,0,0.04)] px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-[12.5px] leading-[1.35] font-semibold">{row.name}</div>
                {row.sub ? <div className="mt-0.5 text-[11px] text-[rgba(0,0,0,0.45)]">{row.sub}</div> : null}
              </div>
              {row.fhir ? (
                <FhirButton resourcePath={row.fhir.resourcePath} raw={row.fhir.raw} server={row.fhir.server} />
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function PatientHistory({ patient }: { patient: OpsPatient }) {
  const [history, setHistory] = useState<HistoryData>({
    conditions: [],
    medications: [],
    allergies: [],
    encounters: [],
    baselineObservations: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);

    async function poll() {
      try {
        const response = await fetch(`/api/patients/${patient.id}/history`);
        const data = (await response.json()) as HistoryData & { error?: boolean };
        if (!cancelled) {
          setError(data.error === true);
          // A degraded response keeps the last good record instead of rendering fabricated empty sections.
          if (!data.error) setHistory(data);
        }
      } catch (err) {
        console.error("failed to poll patient history", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    poll();
    const interval = setInterval(poll, HISTORY_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [patient.id]);

  // FHIR fetch failed: say so per section instead of implying an empty record.
  const sectionEmptyText = error ? "ehr-fhir-server unreachable — record unavailable." : undefined;

  const demographics: RecordRow[] = [
    {
      key: patient.id,
      name: patient.name,
      sub: [
        patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : null,
        patient.birthDate ? `born ${patient.birthDate}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
      fhir: { resourcePath: `Patient/${patient.id}`, raw: patient.raw },
    },
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="px-5 py-[18px]">
        <div className="mb-3.5 flex items-baseline justify-between">
          <span className="text-[14px] font-bold">Patient record</span>
        </div>
        {!loaded ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            <RecordSection title="Demographics" rtype="Patient" rows={demographics} />
            <RecordSection
              title="Encounter"
              rtype="Encounter"
              emptyText={sectionEmptyText}
              rows={history.encounters.map((encounter) => ({
                key: encounter.id,
                name: encounter.name,
                sub: encounter.sub,
                fhir: {
                  resourcePath: `Encounter/${encounter.id}`,
                  raw: encounter.raw,
                  server: "ehr" as const,
                },
              }))}
            />
            <RecordSection
              title="Conditions"
              rtype="Condition"
              emptyText={sectionEmptyText}
              rows={history.conditions.map((condition) => ({
                key: condition.id,
                name: condition.code,
                sub: condition.onsetDateTime
                  ? `since ${new Date(condition.onsetDateTime).toLocaleDateString()}`
                  : null,
                fhir: { resourcePath: `Condition/${condition.id}`, raw: condition.raw },
              }))}
            />
            <RecordSection
              title="Allergies"
              rtype="AllergyIntolerance"
              emptyText={sectionEmptyText}
              rows={history.allergies.map((allergy) => ({
                key: allergy.id,
                name: allergy.substance,
                sub: allergy.reaction ? `reaction: ${allergy.reaction}` : null,
                fhir: { resourcePath: `AllergyIntolerance/${allergy.id}`, raw: allergy.raw },
              }))}
            />
            <RecordSection
              title="Medications"
              rtype="MedicationRequest"
              emptyText={sectionEmptyText}
              rows={history.medications.map((medication) => ({
                key: medication.id,
                name: medication.medication,
                sub: medication.status ?? null,
                fhir: { resourcePath: `MedicationRequest/${medication.id}`, raw: medication.raw },
              }))}
            />
            <RecordSection
              title="Baseline observations"
              rtype="Observation"
              emptyText={sectionEmptyText}
              rows={history.baselineObservations.map((observation) => ({
                key: observation.id,
                name: observation.name,
                sub:
                  [
                    observation.value,
                    observation.effectiveDateTime
                      ? new Date(observation.effectiveDateTime).toLocaleDateString()
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || null,
                fhir: {
                  resourcePath: `Observation/${observation.id}`,
                  raw: observation.raw,
                  server: "ehr" as const,
                },
              }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
