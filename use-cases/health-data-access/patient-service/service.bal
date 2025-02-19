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

import ballerina/http;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhirr4;
import ballerinax/health.fhir.r4.uscore501;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4.parser;
import ballerina/log;
import ballerinax/health.fhir.r4.international401;

# FHIR server configurations
configurable string fhirServerUrl = ?;
configurable string tokenUrl = ?;
configurable string[] scopes = ?;
configurable string client_id = ?;
configurable string client_secret = ?;


# Generic type to wrap all implemented profiles.
# Add required profile types here.
# public type Patient r4:Patient|<other_Patient_Profile>;
public type Patient uscore501:USCorePatientProfile|international401:Patient;

# initialize source system endpoint here

# A service representing a network-accessible API
# bound to port `9090`.
service / on new fhirr4:Listener(9091, apiConfig) {

    // Read the current state of single resource based on its id.
    isolated resource function get fhir/r4/Patient/[string id] (r4:FHIRContext fhirContext) returns Patient|r4:OperationOutcome|r4:FHIRError {
        fhir:FHIRResponse response = check getById("Patient", id);

        do {
            return <international401:Patient> check parser:parse(response.'resource, international401:Patient);
        } on fail error parseError {
            log:printError(string `Error occurred while parsing : ${parseError.message()}`, parseError);
            return r4:createFHIRError(parseError.message(), r4:ERROR, r4:INVALID, httpStatusCode = http:STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    // Read the state of a specific version of a resource based on its id.
    isolated resource function get fhir/r4/Patient/[string id]/_history/[string vid] (r4:FHIRContext fhirContext) returns Patient|r4:OperationOutcome|r4:FHIRError {
        return r4:createFHIRError("Not implemented", r4:ERROR, r4:INFORMATIONAL, httpStatusCode = http:STATUS_NOT_IMPLEMENTED);
    }

    // Search for resources based on a set of criteria.
    isolated resource function get fhir/r4/Patient(r4:FHIRContext fhirContext) returns r4:Bundle|r4:OperationOutcome|r4:FHIRError {
        fhir:FHIRResponse searchResult = check search("Patient", getQueryParamsMap(fhirContext.getRequestSearchParameters()));

        do {
            r4:Bundle bundle = check searchResult.'resource.cloneWithType(r4:Bundle);
            return bundle;

        } on fail error parseError {
            log:printError(string `Error occurred while parsing : ${parseError.message()}`, parseError);
            return r4:createFHIRError(parseError.message(), r4:ERROR, r4:INVALID, httpStatusCode = http:STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    // Create a new resource.
    isolated resource function post fhir/r4/Patient(r4:FHIRContext fhirContext, Patient patient) returns Patient|r4:OperationOutcome|r4:FHIRError {
        fhir:FHIRResponse response = check create(patient.toJson());
        
        ResponseResource|error resourceResult = response.'resource.cloneWithType(ResponseResource);

        if resourceResult is ResponseResource{
            patient.id = resourceResult.resourceId;
        }

        return patient;
    }

    // Update the current state of a resource completely.
    isolated resource function put fhir/r4/Patient/[string id] (r4:FHIRContext fhirContext, Patient patient) returns Patient|r4:OperationOutcome|r4:FHIRError {
       fhir:FHIRResponse response = check update(patient.toJson());

       do {
            return <uscore501:USCorePatientProfile> check parser:parse(response.'resource, uscore501:USCorePatientProfile);
        } on fail error parseError {
            log:printError(string `Error occurred while parsing : ${parseError.message()}`, parseError);
            return r4:createFHIRError(parseError.message(), r4:ERROR, r4:INVALID, httpStatusCode = http:STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    // Update the current state of a resource partially.
    isolated resource function patch fhir/r4/Patient/[string id] (r4:FHIRContext fhirContext, json patch) returns Patient|r4:OperationOutcome|r4:FHIRError {
        fhir:FHIRResponse response = check patchResource("Patient", id, patch);

        do {
            return <uscore501:USCorePatientProfile> check parser:parse(response.'resource, uscore501:USCorePatientProfile);
        } on fail error parseError {
            log:printError(string `Error occurred while parsing : ${parseError.message()}`, parseError);
            return r4:createFHIRError(parseError.message(), r4:ERROR, r4:INVALID, httpStatusCode = http:STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    // Delete a resource.
    isolated resource function delete fhir/r4/Patient/[string id] (r4:FHIRContext fhirContext) returns r4:OperationOutcome?|r4:FHIRError? {
        _ = check delete("Patient", id);
    }

    // Retrieve the update history for a particular resource.
    isolated resource function get fhir/r4/Patient/[string id]/_history (r4:FHIRContext fhirContext) returns r4:Bundle|r4:OperationOutcome|r4:FHIRError {
        return r4:createFHIRError("Not implemented", r4:ERROR, r4:INFORMATIONAL, httpStatusCode = http:STATUS_NOT_IMPLEMENTED);
    }

    // Retrieve the update history for all resources.
    isolated resource function get fhir/r4/Patient/_history (r4:FHIRContext fhirContext) returns r4:Bundle|r4:OperationOutcome|r4:FHIRError {
        return r4:createFHIRError("Not implemented", r4:ERROR, r4:INFORMATIONAL, httpStatusCode = http:STATUS_NOT_IMPLEMENTED);
    }
}
