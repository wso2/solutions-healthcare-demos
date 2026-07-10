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

import ballerinax/health.base.auth;
import ballerinax/health.clients.fhir;

// Epic sandbox — SMART Backend Services (private key JWT client assertion)
configurable string epicBaseUrl = "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4";
configurable string epicTokenUrl = "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token";
configurable string epicClientId = ?;
configurable string epicKeyFile = ?;

// Cerner sandbox — system app (OAuth2 client credentials)
configurable string cernerBaseUrl = "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d";
configurable string cernerTokenUrl = "https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/protocols/oauth2/profiles/smart-v1/token";
configurable string cernerClientId = ?;
configurable string cernerClientSecret = ?;
configurable string[] cernerScopes = [
    "system/Patient.read",
    "system/Condition.read",
    "system/Observation.read",
    "system/AllergyIntolerance.read",
    "system/MedicationRequest.read"
];

auth:PKJWTAuthConfig epicAuthConfig = {
    clientId: epicClientId,
    tokenEndpoint: epicTokenUrl,
    keyFile: epicKeyFile
};

final fhir:FHIRConnector epicClient = check new ({
    baseURL: epicBaseUrl,
    authConfig: epicAuthConfig,
    timeout: 90
});
final fhir:FHIRConnector cernerClient = check new ({
    baseURL: cernerBaseUrl,
    timeout: 90,
    authConfig: {
        tokenUrl: cernerTokenUrl,
        clientId: cernerClientId,
        clientSecret: cernerClientSecret,
        scopes: cernerScopes
    }
});

# Returns the FHIR connector for the given EMR.
#
# + emr - source EMR
# + return - Epic or Cerner FHIR connector
isolated function emrClient(EmrSystem emr) returns fhir:FHIRConnector =>
    emr == EPIC ? epicClient : cernerClient;

# Builds a FHIR search parameter map, omitting absent values.
#
# + params - name/value pairs where () means "omit"
# + return - search parameter map suitable for FHIRConnector->search
isolated function searchParams(map<string?> params) returns map<string[]> {
    map<string[]> searchParameters = {};
    foreach [string, string?] [paramName, paramValue] in params.entries() {
        if paramValue is string {
            searchParameters[paramName] = [paramValue];
        }
    }
    return searchParameters;
}
