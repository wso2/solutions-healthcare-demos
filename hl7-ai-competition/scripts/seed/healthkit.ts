import { log } from "./util";
import type { HealthkitPatient, Range, SeedPatient, VitalsProfile } from "./types";

export const HEALTHKIT_URL = process.env.HEALTHKIT_URL ?? "http://localhost:8000";

type ProfileRanges = { heartRate: Range; systolic: Range; diastolic: Range; spo2: Range; respiratoryRate: Range };

const PROFILES: Record<VitalsProfile, ProfileRanges> = {
  stable: { heartRate: { min: 60, max: 72 }, systolic: { min: 108, max: 118 }, diastolic: { min: 68, max: 78 }, spo2: { min: 97, max: 99 }, respiratoryRate: { min: 12, max: 15 } },
  borderline: { heartRate: { min: 78, max: 92 }, systolic: { min: 122, max: 134 }, diastolic: { min: 78, max: 86 }, spo2: { min: 94, max: 96 }, respiratoryRate: { min: 16, max: 19 } },
  at_risk: { heartRate: { min: 96, max: 118 }, systolic: { min: 145, max: 168 }, diastolic: { min: 92, max: 106 }, spo2: { min: 88, max: 93 }, respiratoryRate: { min: 20, max: 24 } },
};

async function healthkitPost<T>(path: string, body: unknown): Promise<T[]> {
  const res = await fetch(`${HEALTHKIT_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Array.isArray(body) ? body : [body]),
  });
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T[];
}

async function findPatientByMrn(mrn: string): Promise<HealthkitPatient | null> {
  const res = await fetch(`${HEALTHKIT_URL}/patients?limit=1000`);
  if (!res.ok) {
    throw new Error(`GET /patients failed: ${res.status} ${await res.text()}`);
  }
  const patients = (await res.json()) as HealthkitPatient[];
  return patients.find((p) => p.mrn === mrn) ?? null;
}

export async function linkFhirPatient(patientUuid: string, fhirPatientId: string): Promise<void> {
  const res = await fetch(`${HEALTHKIT_URL}/patients/${patientUuid}/fhir-link`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fhir_patient_id: fhirPatientId }),
  });
  if (!res.ok) {
    throw new Error(`PATCH fhir-link failed: ${res.status} ${await res.text()}`);
  }
}

export async function seedHealthkit(seed: SeedPatient): Promise<HealthkitPatient> {
  const existing = await findPatientByMrn(seed.patient.mrn);
  if (existing) {
    log(`apple-healthkit-simulator already has patient ${seed.patient.mrn} (id=${existing.id}); skipping.`);
    return existing;
  }

  const [patient] = await healthkitPost<HealthkitPatient>("/patients", {
    mrn: seed.patient.mrn,
    given_name: seed.patient.given_name,
    family_name: seed.patient.family_name,
    date_of_birth: seed.patient.date_of_birth,
  });
  log(`created patient id=${patient.id} (${seed.patient.mrn})`);

  await healthkitPost("/characteristics", { ...seed.healthkit.characteristics, patient_id: patient.id });

  const quantitySamples = seed.healthkit.quantity_samples.map((s) => ({ ...s, patient_id: patient.id }));
  await healthkitPost("/quantity-samples", quantitySamples);

  await healthkitPost(
    "/category-samples",
    seed.healthkit.category_samples.map((s) => ({ ...s, patient_id: patient.id })),
  );

  for (const bp of seed.healthkit.blood_pressure_correlations) {
    const [correlation] = await healthkitPost<{ id: number }>("/correlations", {
      patient_id: patient.id,
      source_name: bp.source_name,
      correlation_type: "HKCorrelationTypeIdentifierBloodPressure",
      start_date: bp.start_date,
      end_date: bp.end_date,
    });
    await healthkitPost("/quantity-samples", [
      {
        patient_id: patient.id,
        correlation_id: correlation.id,
        source_name: bp.source_name,
        quantity_type: "HKQuantityTypeIdentifierBloodPressureSystolic",
        value: bp.systolic.value,
        unit: bp.systolic.unit,
        start_date: bp.start_date,
        end_date: bp.end_date,
      },
      {
        patient_id: patient.id,
        correlation_id: correlation.id,
        source_name: bp.source_name,
        quantity_type: "HKQuantityTypeIdentifierBloodPressureDiastolic",
        value: bp.diastolic.value,
        unit: bp.diastolic.unit,
        start_date: bp.start_date,
        end_date: bp.end_date,
      },
    ]);
  }

  await healthkitPost("/workouts", seed.healthkit.workouts.map((w) => ({ ...w, patient_id: patient.id })));

  await healthkitPost(
    "/activity-summaries",
    seed.healthkit.activity_summaries.map((s) => ({ ...s, patient_id: patient.id })),
  );

  log(
    `seeded ${quantitySamples.length} quantity samples, ${seed.healthkit.category_samples.length} category samples, ` +
      `${seed.healthkit.blood_pressure_correlations.length} BP correlations, ${seed.healthkit.workouts.length} workouts, ` +
      `${seed.healthkit.activity_summaries.length} activity summaries`,
  );
  return patient;
}

function randomInRange({ min, max }: Range): number {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

async function seedHourlyVitals(patient: HealthkitPatient, profile: ProfileRanges, hourStart: Date): Promise<void> {
  const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
  const isoStart = hourStart.toISOString();

  await healthkitPost("/quantity-samples", [
    {
      patient_id: patient.id,
      source_name: "Apple Watch",
      quantity_type: "HKQuantityTypeIdentifierHeartRate",
      value: randomInRange(profile.heartRate),
      unit: "count/min",
      start_date: isoStart,
      end_date: hourEnd.toISOString(),
    },
    {
      patient_id: patient.id,
      source_name: "Apple Watch",
      quantity_type: "HKQuantityTypeIdentifierOxygenSaturation",
      value: randomInRange(profile.spo2),
      unit: "%",
      start_date: isoStart,
      end_date: hourEnd.toISOString(),
    },
    {
      patient_id: patient.id,
      source_name: "Apple Watch",
      quantity_type: "HKQuantityTypeIdentifierRespiratoryRate",
      value: randomInRange(profile.respiratoryRate),
      unit: "count/min",
      start_date: isoStart,
      end_date: hourEnd.toISOString(),
    },
  ]);

  const [correlation] = await healthkitPost("/correlations", {
    patient_id: patient.id,
    source_name: "Withings BPM Connect",
    correlation_type: "HKCorrelationTypeIdentifierBloodPressure",
    start_date: isoStart,
    end_date: isoStart,
  });
  await healthkitPost("/quantity-samples", [
    {
      patient_id: patient.id,
      correlation_id: correlation.id,
      source_name: "Withings BPM Connect",
      quantity_type: "HKQuantityTypeIdentifierBloodPressureSystolic",
      value: randomInRange(profile.systolic),
      unit: "mmHg",
      start_date: isoStart,
      end_date: isoStart,
    },
    {
      patient_id: patient.id,
      correlation_id: correlation.id,
      source_name: "Withings BPM Connect",
      quantity_type: "HKQuantityTypeIdentifierBloodPressureDiastolic",
      value: randomInRange(profile.diastolic),
      unit: "mmHg",
      start_date: isoStart,
      end_date: isoStart,
    },
  ]);
}

export async function seedVitalsTimeline(
  patients: SeedPatient[],
  healthkitPatients: HealthkitPatient[],
  horizonHours: number,
): Promise<void> {
  const profileByMrn = new Map(patients.map((p) => [p.patient.mrn, p.patient.vitals_profile]));

  const firstHour = new Date();
  firstHour.setMinutes(0, 0, 0);
  firstHour.setHours(firstHour.getHours() + 1);

  for (const patient of healthkitPatients) {
    const profileName = profileByMrn.get(patient.mrn);
    if (!profileName) {
      continue;
    }
    const profile = PROFILES[profileName];
    for (let hour = 0; hour < horizonHours; hour++) {
      await seedHourlyVitals(patient, profile, new Date(firstHour.getTime() + hour * 60 * 60 * 1000));
    }
    log(`seeded ${horizonHours}h of future vitals for ${patient.mrn} (${profileName})`);
  }
}
