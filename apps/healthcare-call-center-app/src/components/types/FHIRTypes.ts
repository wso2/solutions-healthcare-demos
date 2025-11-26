// Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com).
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
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

interface FHIRBundle {
  resourceType: string;
  entry?: FHIRBundleEntry[];
}

interface FHIRBundleEntry {
  resource?: FHIRResource;
  fullUrl?: string;
}

interface FHIRResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown; // For flexible FHIR resource properties
}

interface PatientData {
  name: Array<{ given: string[]; family: string }>;
  gender: string;
  birthDate: string;
  address: Array<{ line: string[]; city: string; postalCode: string }>;
}

interface Allergy {
  id: string;
  clinicalStatus: string;
  criticality: string;
  code: string;
  reaction: string;
}

interface Medication {
  id: string;
  status: string;
  medication: string;
  dosage: string;
  frequency: string;
}

export type {
    FHIRBundle,
    FHIRBundleEntry,
    FHIRResource,
    PatientData,
    Allergy,
    Medication
};
