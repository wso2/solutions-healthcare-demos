export type FhirResource = { resourceType: string; id: string; meta?: { lastUpdated?: string } } & Record<string, unknown>;
export type FhirBundle = { resourceType: "Bundle"; entry?: Array<{ resource: FhirResource }>; link?: Array<{ relation: string; url: string }> };

export const SYNC_LEVELS = [
  ["Patient"],
  ["Encounter", "Condition", "AllergyIntolerance", "MedicationRequest"],
  ["Observation"],
];
