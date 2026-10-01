// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

export type VitalsProfile = "stable" | "borderline" | "at_risk";
export type Range = { min: number; max: number };

export type QuantitySample = Record<string, unknown>;

export type SeedPatient = {
  patient: { mrn: string; given_name: string; family_name: string; date_of_birth: string; vitals_profile: VitalsProfile; has_bp_cuff?: boolean };
  healthkit: {
    characteristics: Record<string, unknown>;
    quantity_samples: QuantitySample[];
    category_samples: Record<string, unknown>[];
    blood_pressure_correlations: Array<{
      source_name: string;
      start_date: string;
      end_date: string;
      systolic: { value: number; unit: string };
      diastolic: { value: number; unit: string };
    }>;
    workouts: Record<string, unknown>[];
    activity_summaries: Record<string, unknown>[];
  };
  fhir: {
    patient: Record<string, unknown>;
    encounter: Record<string, unknown>;
    conditions: Record<string, unknown>[];
    allergies: Record<string, unknown>[];
    medications: Record<string, unknown>[];
    observations: Record<string, unknown>[];
  };
};

export type HealthkitPatient = { id: number; uuid: string; mrn: string; fhir_patient_id: string | null };
