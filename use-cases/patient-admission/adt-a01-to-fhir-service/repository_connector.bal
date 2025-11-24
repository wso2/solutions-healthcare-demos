// Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com).

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

import ballerina/http;
import ballerina/log;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4;

http:OAuth2ClientCredentialsGrantConfig ehrSystemAuthConfig = {
    tokenUrl: tokenUrl is string ? tokenUrl : "",
    clientId: client_id is string ? client_id : "",
    clientSecret: client_secret is string ? client_secret : "",
    scopes: scopes is string[] ? scopes : [],
    optionalParams: {
        "resource": fhirServerUrl is string ? fhirServerUrl : ""
    }
};

fhir:FHIRConnectorConfig ehrSystemConfig = {
    baseURL: fhirServerUrl,
    mimeType: fhir:FHIR_JSON
    // authConfig: ehrSystemAuthConfig
};

isolated final fhir:FHIRConnector fhirConnector = check new (ehrSystemConfig);

public isolated function extractBundleAndSendToFhirRepo(r4:Bundle bundle) returns int|error {

    r4:BundleEntry[] entries = <r4:BundleEntry[]>bundle.entry;
    int lastStatusCode = 0;
    boolean anyFailure = false;

    foreach var entry in entries {
        map<anydata> fhirResource = <map<anydata>>entry?.'resource;
        int sendToFhirRepoResult = sendToFhirRepo(fhirResource.toJson());
        lastStatusCode = sendToFhirRepoResult;
        if sendToFhirRepoResult != 201 {
            anyFailure = true;
            log:printWarn(string `Failed to send FHIR resource to the FHIR repository: ${fhirResource.toJsonString()}`);
        } else {
            log:printDebug(string `FHIR resource sent to the FHIR repository: ${fhirResource.toJsonString()}`);
        }
    }
    if anyFailure {
        return error("Failed to send one or more resources to the FHIR repository");
    }
    return lastStatusCode;
}

public isolated function sendToFhirRepo(json fhirResource) returns int {

    fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnector->create(fhirResource);
    if fhirResponse is fhir:FHIRResponse {
        log:printInfo(string `FHIR response: ${fhirResponse.toString()}`);
        log:printInfo(string `Location: ${fhirResponse.serverResponseHeaders.get(location_header_key)}`);
        return fhirResponse.httpStatusCode;
    } else if fhirResponse is fhir:FHIRError {
        log:printError(string `Error in sending to FHIR Repository. FHIR error: ${fhirResponse.toString()}. \n Resource: ${fhirResource.toJsonString()}`);
        return http:INTERNAL_SERVER_ERROR.status.code;
    }
}

public isolated function searchInFhirRepo(string resourceType, string paramName, string paramValue) returns json|xml|error {

    map<string[]> searchParameters = {};
    searchParameters[paramName] = [paramValue];

    fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnector->search(resourceType, searchParameters = searchParameters);
    if fhirResponse is fhir:FHIRResponse {
        log:printInfo(string `FHIR response: ${fhirResponse.toString()}`);
        return fhirResponse.'resource;
    } else if fhirResponse is fhir:FHIRError {
        log:printError(string `FHIR error: ${fhirResponse.toString()}`);
        return error("Failed to search in FHIR repository");
    }
}

public isolated function getById(string resourceType, string id) returns json|xml|error {

    fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnector->getById(resourceType, id, fhir:FHIR_JSON);
    if fhirResponse is fhir:FHIRResponse {
        log:printInfo(string `FHIR response: ${fhirResponse.toString()}`);
        return fhirResponse.'resource;
    } else if fhirResponse is fhir:FHIRError {
        log:printError(string `FHIR error: ${fhirResponse.toString()}`);
        return error(string `FHIR search failed: ${fhirResponse.toString()}`);
    }
}

public isolated function update(json fhirResource) returns int|error {

    fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnector->update(fhirResource, fhir:FHIR_JSON);
    if fhirResponse is fhir:FHIRResponse {
        log:printInfo(string `FHIR response: ${fhirResponse.toString()}`);
        return fhirResponse.httpStatusCode;
    } else if fhirResponse is fhir:FHIRError {
        log:printError(string `FHIR error: ${fhirResponse.toString()}`);
        return error(string `FHIR getById failed: ${fhirResponse.toString()}`);
    }
}
