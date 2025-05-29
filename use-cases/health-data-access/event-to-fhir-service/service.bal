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

# FHIR server configurations
configurable string fhirServerUrl = ?;
configurable string tokenUrl = ?;
configurable string[] scopes = ?;
configurable string client_id = ?;
configurable string client_secret = ?;

service / on new http:Listener(9090) {

    function init() returns error? {
        log:printInfo("Health data consumer service started");
    }

    resource function post events(HealthDataEvent[] events) returns json|error? {
        json[] createdResources = [];
        foreach var event in events {
            log:printInfo(string `Health data event received: ${event?.payload.toJsonString()}`, event = event);
            string? dataType = event?.dataType;
            if dataType is string {
                anydata|r4:FHIRError mappedData = mapToFhir(dataType, event?.payload);
                if mappedData is r4:FHIRError {
                    log:printError("Error occurred while mapping the data: ", mappedData);
                } else {
                    log:printInfo(string `FHIR resource mapped: ${mappedData.toJsonString()}`, mappedData = mappedData.toJson());
                    r4:FHIRError|fhir:FHIRResponse response = createResource(mappedData.toJson());
                    if response is fhir:FHIRResponse {
                        log:printInfo(string `FHIR resource created: ${response.toJsonString()}`, createdResource = response.toJson());
                        // Add the created resource to the response array
                        createdResources.push(response.'resource.toJson());
                    }
                }
            } else {
                log:printError("Invalid data type: ", dataType);
            }
        }
        if createdResources.length() == 0 {
            return error("Failed to create resources");
        }
        // Return the created resources
        return {createdResources: createdResources};
    }
}

