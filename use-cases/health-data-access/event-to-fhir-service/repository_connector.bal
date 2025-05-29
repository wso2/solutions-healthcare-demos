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
    tokenUrl: tokenUrl,
    clientId: client_id,
    clientSecret: client_secret,
    scopes: scopes,
    optionalParams: {
        "resource": fhirServerUrl
    }
};

fhir:FHIRConnectorConfig ehrSystemConfig = {
    baseURL: fhirServerUrl,
    mimeType: fhir:FHIR_JSON,
    authConfig: ehrSystemAuthConfig
};

isolated fhir:FHIRConnector fhirConnectorObj = check new ({
    baseURL: fhirServerUrl,
    mimeType: fhir:FHIR_JSON,
    authConfig: {
        tokenUrl: tokenUrl,
        clientId: client_id,
        clientSecret: client_secret,
        scopes: scopes,
        optionalParams: {
            "resource": fhirServerUrl
        }
    }
});

public isolated function createResource(json payload) returns r4:FHIRError|fhir:FHIRResponse {
    lock {
        fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnectorObj->create(payload.clone());
        if fhirResponse is fhir:FHIRError {
            log:printError(fhirResponse.toBalString());
            return r4:createFHIRError(fhirResponse.message(), r4:ERROR, r4:INVALID, httpStatusCode = http:STATUS_INTERNAL_SERVER_ERROR);
        }
        log:printInfo(string `Data stored successfully: ${fhirResponse.toJsonString()}`);
        return fhirResponse.clone();
    }
}
