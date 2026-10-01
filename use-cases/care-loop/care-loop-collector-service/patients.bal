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

# Converts a single FHIR Patient resource (as returned by FHIRConnector's getById) into this service's Patient shape.
#
# + patientResourceJson - the raw Patient resource json returned by FHIRConnector
# + fallbackId - used as both the id and display-name fallback if the resource is missing either
# + return - the converted Patient, or an error if the json isn't a valid Patient resource
isolated function extractPatient(json patientResourceJson, string fallbackId) returns Patient|error {
    international401:Patient patientResource = check patientResourceJson.cloneWithType(international401:Patient);
    string id = patientResource.id ?: fallbackId;
    return {id, name: extractPatientName(patientResource, id)};
}

isolated function extractPatientName(international401:Patient patientResource, string fallbackId) returns string {
    r4:HumanName[]? names = patientResource.name;
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
    if given != "" {
        return given;
    }
    return fallbackId;
}
