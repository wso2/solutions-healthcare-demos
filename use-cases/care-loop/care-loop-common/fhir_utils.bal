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

import ballerinax/health.clients.fhir;

# Capability-statement validation would GET /metadata at construction time, racing the caller's own startup against the FHIR server's - disabled for every connector built this way.
public isolated function newFhirConnector(string baseUrl) returns fhir:FHIRConnector|error =>
    new ({baseURL: baseUrl}, enableCapabilityStatementValidation = false);

# create()'s default MINIMAL preference returns {resourceId, version}, not a full resource - fall back to "id" in case that changes.
public isolated function extractFhirId(fhir:FHIRResponse response) returns string? {
    json|xml resourceValue = response.'resource;
    if resourceValue is xml {
        return ();
    }
    string|error resourceId = trap <string>(checkpanic resourceValue.resourceId);
    if resourceId is string {
        return resourceId;
    }
    string|error id = trap <string>(checkpanic resourceValue.id);
    return id is string ? id : ();
}
