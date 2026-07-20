import type { ObservationSummary } from "@/app/api/patients/[id]/observations/route";

export const HEART_RATE_LOINC = "8867-4";
export const SPO2_LOINC = "59408-5";
const RESP_RATE_LOINC = "9279-1";
const SYSTOLIC_LOINC = "8480-6";
const DIASTOLIC_LOINC = "8462-4";

export type ObservationDto = ObservationSummary;

export interface VitalsRow {
  time: string;
  hr: ObservationDto | null;
  spo2: ObservationDto | null;
  rr: ObservationDto | null;
  systolic: ObservationDto | null;
  diastolic: ObservationDto | null;
}

export function loincCode(observation: ObservationDto): string | undefined {
  return observation.raw.code?.coding?.[0]?.code;
}

// The simulator posts each vital sign (HR/SpO2/RR/systolic/diastolic) as its own Observation with its own effectiveDateTime, not a single shared batch timestamp, and doesn't guarantee all five are present every cycle. Bucketing to the minute groups same-cycle readings into one row without inventing a shared timestamp field.
export function groupIntoRows(observations: ObservationDto[]): VitalsRow[] {
  const buckets = new Map<string, VitalsRow>();

  for (const observation of observations) {
    if (!observation.effectiveDateTime) continue;
    const bucketKey = observation.effectiveDateTime.slice(0, 16);
    const row =
      buckets.get(bucketKey) ??
      ({
        time: bucketKey,
        hr: null,
        spo2: null,
        rr: null,
        systolic: null,
        diastolic: null,
      } satisfies VitalsRow);

    // Observations arrive newest-first (route sorts -date), so keep the first reading seen per cell - an older same-minute reading must not overwrite a newer one.
    switch (loincCode(observation)) {
      case HEART_RATE_LOINC:
        row.hr ??= observation;
        break;
      case SPO2_LOINC:
        row.spo2 ??= observation;
        break;
      case RESP_RATE_LOINC:
        row.rr ??= observation;
        break;
      case SYSTOLIC_LOINC:
        row.systolic ??= observation;
        break;
      case DIASTOLIC_LOINC:
        row.diastolic ??= observation;
        break;
      default:
        // Non-vitals Observation - don't create an all-empty ghost row for its bucket.
        continue;
    }

    buckets.set(bucketKey, row);
  }

  return [...buckets.values()].sort((a, b) => (a.time < b.time ? 1 : -1));
}

const COMPACT_UNITS: Record<string, string> = {
  "beats/minute": "bpm",
  "breaths/minute": "/min",
};

export function compactUnit(unit: string): string {
  return COMPACT_UNITS[unit] ?? unit;
}

export function cellValue(observation: ObservationDto | null): string {
  if (!observation || observation.value === null) return "—";
  if (!observation.unit) return observation.value;
  const unit = compactUnit(observation.unit);
  // Percent hugs the value ("95.7%"); other units get a space.
  return unit === "%" ? `${observation.value}%` : `${observation.value} ${unit}`;
}

export function bloodPressureValue(row: VitalsRow): string {
  if (!row.systolic?.value || !row.diastolic?.value) return "—";
  return `${row.systolic.value}/${row.diastolic.value} mmHg`;
}

// Rows with at least one renderable value - a lone systolic can't render a BP pair. Shared by the vitals table and the tab count so the badge equals the rendered row count.
export function displayableRows(observations: ObservationDto[]): VitalsRow[] {
  return groupIntoRows(observations).filter(
    (row) => row.hr !== null || row.spo2 !== null || row.rr !== null || (row.systolic !== null && row.diastolic !== null),
  );
}
