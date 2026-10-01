// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

# + patientName - display name extracted from the Patient resource, falling back to the patientId
# + ageSexSummary - e.g. "68F", for a compact narrative lead-in
public type PatientDisplay record {|
    string patientName;
    string ageSexSummary;
|};

# Deliberately just identity/demographics - deeper medical history is the risk-assessment agent's own job via its MCP toolkit.
# 
# + patient - Patient Resource
# + fallbackId - fallback identifier for the patient
# + age - age of the patient
# + sex - Sex of the patient
# + return - PatientDisplay record containing name and age/sex summary
isolated function patientDisplay(international401:Patient patient, string fallbackId, int age, "M"|"F" sex) returns PatientDisplay {
    return {patientName: extractPatientDisplayName(patient, fallbackId), ageSexSummary: age.toString() + sex};
}

isolated function extractPatientDisplayName(international401:Patient patient, string fallbackId) returns string {
    r4:HumanName[]? names = patient.name;
    if names is () || names.length() == 0 {
        return fallbackId;
    }
    r4:HumanName name = names[0];
    if name.text is string {
        return <string>name.text;
    }
    string? family = name.family;
    string[]? givenList = name.given;
    string given = givenList is string[] && givenList.length() > 0 ? givenList[0] : "";
    if family is string && given != "" {
        return given + " " + family;
    }
    if family is string {
        return family;
    }
    return given != "" ? given : fallbackId;
}
