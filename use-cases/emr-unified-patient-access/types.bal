// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

# Supported EMR systems in the care network.
public enum EmrSystem {
    EPIC = "epic",
    CERNER = "cerner"
}

# Simplified patient demographics returned by the API.
public type PatientSummary record {|
    # Logical id of the patient in the source EMR
    string patientId;
    # EMR the record was fetched from
    string sourceEmr;
    # Full display name
    string fullName;
    # Structured family name (used for cross-EMR matching)
    string family?;
    # Structured given name (used for cross-EMR matching)
    string given?;
    # Administrative gender
    string gender?;
    # Date of birth (YYYY-MM-DD)
    string birthDate?;
    # Medical record number or other primary identifier
    string mrn?;
    # Contact phone number
    string phone?;
    # Postal address as a single line
    string address?;
|};

# A diagnosed condition entry.
public type ConditionSummary record {|
    # Condition display text
    string condition;
    # Clinical status (active, resolved, ...)
    string clinicalStatus?;
    # Date the condition was recorded
    string recordedDate?;
|};

# An active or past medication order.
public type MedicationSummary record {|
    # Medication display name
    string medication;
    # Order status (active, completed, ...)
    string status?;
    # Date the order was authored
    string authoredOn?;
    # Dosage instruction text
    string dosageInstruction?;
|};

# An allergy or intolerance entry.
public type AllergySummary record {|
    # Allergen display text
    string substance;
    # Clinical status (active, inactive, ...)
    string clinicalStatus?;
    # Criticality (low, high, unable-to-assess)
    string criticality?;
|};

# A single observation (vital sign or lab result).
public type ObservationSummary record {|
    # Observation display name
    string name;
    # Recorded value with unit, e.g. "125 mmHg"
    string value?;
    # Effective date/time of the observation
    string effectiveDate?;
|};

# Aggregated 360-degree clinical view of a patient from one EMR.
public type Patient360 record {|
    # Patient demographics
    PatientSummary patient;
    # Diagnosed conditions
    ConditionSummary[] conditions;
    # Medication orders
    MedicationSummary[] medications;
    # Allergies and intolerances
    AllergySummary[] allergies;
    # Vital signs
    ObservationSummary[] vitals;
    # Laboratory results
    ObservationSummary[] labResults;
    # Non-fatal issues encountered while aggregating (e.g. a resource type the app is not scoped for)
    string[] warnings;
|};

# Result of looking a patient id up across all connected EMRs.
public type UnifiedPatientResult record {|
    # The patient id that was queried
    string queriedId;
    # EMRs where the id resolved to a patient
    string[] foundIn;
    # Patient records returned by each EMR that had the patient
    PatientSummary[] records;
    # Per-EMR lookup issues (e.g. not found in one system)
    string[] warnings;
|};

# Combined demographic search results from all connected EMRs.
public type UnifiedSearchResult record {|
    # EMRs that returned at least one match
    string[] foundIn;
    # Matching patients from every EMR (sourceEmr identifies the origin)
    PatientSummary[] patients;
    # Per-EMR search issues
    string[] warnings;
|};

# Cross-EMR Patient-360: clinical summaries from every EMR holding the patient,
# linked either by shared id or by demographic matching.
public type UnifiedPatient360 record {|
    # The patient id that was queried
    string queriedId;
    # EMR the queried id resolved in
    string primaryEmr;
    # How the record in the other EMR was linked, when present
    string linkedVia?;
    # One clinical summary per EMR holding the patient
    Patient360[] summaries;
    # Non-fatal issues encountered while aggregating or linking
    string[] warnings;
|};

# Request payload to initiate a cross-EMR referral.
public type ReferralRequest record {|
    # EMR holding the patient's clinical record
    EmrSystem sourceEmr;
    # EMR of the receiving facility
    EmrSystem targetEmr;
    # Patient id in the source EMR
    string patientId;
    # Reason for the referral
    string reason;
|};

# Candidate patient match found in the target EMR.
public type PatientMatch record {|
    # Matched patient demographics in the target EMR
    PatientSummary patient;
    # How the candidate was matched, e.g. "name + birthDate"
    string matchedOn;
|};

# Transition-of-care packet assembled from the source EMR and matched against the target EMR.
public type ReferralPacket record {|
    # Unique id assigned to this referral
    string referralId;
    # Reason for the referral
    string reason;
    # EMR the clinical content originated from
    string sourceEmr;
    # EMR of the receiving facility
    string targetEmr;
    # Full clinical summary pulled from the source EMR
    Patient360 clinicalSummary;
    # Candidate patient matches found in the target EMR
    PatientMatch[] targetMatches;
    # Overall match outcome: MATCH_FOUND or NO_MATCH
    string matchOutcome;
    # Non-fatal issues encountered while matching
    string[] warnings;
|};
