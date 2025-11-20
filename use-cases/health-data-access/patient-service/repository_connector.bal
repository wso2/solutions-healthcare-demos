// Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com).

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
import ballerinax/health.clients.fhir;
import ballerina/http;
import ballerina/log;
import ballerinax/health.fhir.r4;

http:OAuth2ClientCredentialsGrantConfig fhirServerAuthConfig = {
    tokenUrl: tokenUrl,
    clientId: client_id,
    clientSecret: client_secret,
    scopes: scopes,
    optionalParams: {
        "resource": fhirServerUrl
    }
};

fhir:FHIRConnectorConfig fhirServerConfig = {
    baseURL: fhirServerUrl,
    mimeType: fhir:FHIR_JSON,
    authConfig : fhirServerAuthConfig
};

isolated fhir:FHIRConnector fhirConnectorObj = check new (fhirServerConfig);

public isolated function create(json payload) returns r4:FHIRError|fhir:FHIRResponse{
    lock {
            fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnectorObj->create(payload.clone());

            if fhirResponse is fhir:FHIRError{
                log:printError(fhirResponse.toBalString());
                return r4:createFHIRError(fhirResponse.message(), r4:ERROR, r4:INVALID, httpStatusCode = http:STATUS_INTERNAL_SERVER_ERROR);

            }

            log:printInfo(string `Data stored successfully: ${fhirResponse.toJsonString()}`);
            return fhirResponse.clone();
    }
}

public isolated function getById(string 'resource, string id) returns r4:FHIRError|fhir:FHIRResponse {
    lock {
        fhir:FHIRResponse|fhir:FHIRError response = fhirConnectorObj->getById('resource, id);

        if response is fhir:FHIRError {
            log:printError(response.toBalString());
            return r4:createFHIRError(response.message(), r4:ERROR, r4:INVALID, httpStatusCode = http:STATUS_INTERNAL_SERVER_ERROR);
        }

        return response.clone();
    }
}

public isolated function update(json payload) returns r4:FHIRError|fhir:FHIRResponse{
    lock {
            fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnectorObj->update(payload.clone(), returnPreference = fhir:REPRESENTATION);

            if fhirResponse is fhir:FHIRError{
                log:printError(fhirResponse.toBalString());
                return r4:createFHIRError(fhirResponse.message(), r4:ERROR, r4:INVALID, httpStatusCode = http:STATUS_INTERNAL_SERVER_ERROR);
            }

            log:printInfo(string `Data updated successfully: ${fhirResponse.toJsonString()}`);
            return fhirResponse.clone();
    }
}

public isolated function patchResource(string 'resource, string id, json payload) returns r4:FHIRError|fhir:FHIRResponse{
    lock {
            fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnectorObj->patch('type = 'resource, id =id, data = payload.clone());

            if fhirResponse is fhir:FHIRError{
                log:printError(fhirResponse.toBalString());
                return r4:createFHIRError(fhirResponse.message(), r4:ERROR, r4:INVALID, httpStatusCode = http:STATUS_INTERNAL_SERVER_ERROR);
            }

            log:printInfo(string `Data patched successfully: ${fhirResponse.toJsonString()}`);
            return fhirResponse.clone();
    }
}

public isolated function delete(string 'resource, string id) returns r4:FHIRError|fhir:FHIRResponse{
    lock {
        fhir:FHIRResponse|fhir:FHIRError response = fhirConnectorObj->delete('resource, id);

        if response is fhir:FHIRError {
            log:printError(response.toBalString());
            return r4:createFHIRError(response.message(), r4:ERROR, r4:INVALID, httpStatusCode = http:STATUS_INTERNAL_SERVER_ERROR);
        }

        log:printInfo(string `Data deleted successfully: ${response.toJsonString()}`);
        return response.clone();
    }
}

public isolated function search(string 'resource, map<string[]>? searchParameters = ()) returns r4:FHIRError|fhir:FHIRResponse{
    lock {
        fhir:FHIRResponse|fhir:FHIRError response = fhirConnectorObj->search('resource, searchParameters=searchParameters.clone());

        if response is fhir:FHIRError {
            log:printError(response.toBalString());
            return r4:createFHIRError(response.message(), r4:ERROR, r4:INVALID, httpStatusCode = http:STATUS_INTERNAL_SERVER_ERROR);
        }
        
        return response.clone();
    }
}
