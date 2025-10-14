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
import ballerina/time;
import ballerina/lang.array;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

// In-memory storage for patient mappings using unique patient ID as the key
final map<SystemPatientMapping[]> patientMappingStore = {
    "UP001": [
        {systemPatientId: "444222222", systemId: "H001", resourceUrl: "http://hospital1.com/patients/", firstName: "John", lastName: "Doe", dateOfBirth: "1980-01-01", gender: "male"}
    ],
    "UP002": [
        {systemPatientId: "4442223435", systemId: "H001", resourceUrl: "http://hospital1.com/patients/", firstName: "Jane", lastName: "Smith", dateOfBirth: "1990-05-15", gender: "female"},
        {systemPatientId: "102938475", systemId: "H002", resourceUrl: "http://hospital2.com/patients/", firstName: "Jane", lastName: "Smith", dateOfBirth: "1990-05-15", gender: "female"}
    ],
    "UP003": [
        {systemPatientId: "4442235435", systemId: "H001", resourceUrl: "http://hospital1.com/patients/", firstName: "Jane", lastName: "Doe", dateOfBirth: "1991-05-15", gender: "female"}
    ]
};

const SEARCH_SET = "searchset"; 

service /mpi on new http:Listener(9090) {

    resource function post 'match(@http:Payload PatientMatchRequestData patientMatchRequestData) returns r4:FHIRError|http:Response {

        json[] parametersArray = patientMatchRequestData.'parameter;
        
        // Get resource parameter (required)
        json? resourceParam = ();
        foreach json param in parametersArray {
            json|error nameResult = param.name;
            if nameResult is json && nameResult == "resource" {
                resourceParam = param;
                break;
            }
        }
        
        if resourceParam is () {
            return throwFHIRError("Required parameter 'resource' not found in the request.", ());
        }
        
        json|error resourceResult = resourceParam.'resource;
        if resourceResult is error {
            return throwFHIRError("Error occurred while getting the resource from the request.", cause = resourceResult);
        }
        international401:Patient|error sourcePatient = resourceResult.cloneWithType();
        if sourcePatient is error {
            return throwFHIRError("Error occurred while getting the source patient from the request.", cause = sourcePatient);
        }
        
        // Get count parameter (optional, default to 10)
        int patientCount = 10; // default value
        foreach json param in parametersArray {
            json|error nameResult = param.name;
            if nameResult is json && nameResult == "count" {
                json|error countResult = param.valueInteger;
                if countResult is json {
                    int|error patientCountResult = countResult.cloneWithType();
                    if patientCountResult is int {
                        patientCount = patientCountResult;
                    }
                }
                break;
            }
        }
        
        // Get onlyCertainMatches parameter (optional, default to false)
        boolean onlyCertainMatches = false; // default value
        foreach json param in parametersArray {
            json|error nameResult = param.name;
            if nameResult is json && nameResult == "onlyCertainMatches" {
                json|error boolResult = param.valueBoolean;
                if boolResult is json {
                    boolean|error onlyCertainMatchesResult = boolResult.cloneWithType();
                    if onlyCertainMatchesResult is boolean {
                        onlyCertainMatches = onlyCertainMatchesResult;
                    }
                }
                break;
            }
        }
        r4:BundleEntry[]|error? patientArray = self.getMatchingPatients(<international401:Patient>sourcePatient);
        if patientArray is () {
            http:Response response = new;
            response.setJsonPayload("No matching patient found");
            return response;
        }
        if patientArray is error {
            return throwFHIRError("Error occurred while getting the matching patients from MPI.", cause = patientArray);
        }
        http:Response response = new;
        if onlyCertainMatches is true && patientArray.length() > 1 {
            response.setJsonPayload("Multiple matching patients found while onlyCertainMatches flag is true");
        }
        if patientArray.length() >= patientCount {
            patientArray.setLength(patientCount);
        }
        r4:Bundle bundle = {
            'type: SEARCH_SET,
            total: patientArray.length(),
            entry: patientArray,
            timestamp: time:utcNow().toString()
        };
        response.setJsonPayload(bundle.toJson());
        return response;

    }

    resource function get [string uniquePatientId]/mappings() returns r4:Parameters|http:NotFound {
        log:printInfo("Received request for patient ID: " + uniquePatientId);
        SystemPatientMapping[]? mappings = patientMappingStore.get(uniquePatientId);
        if mappings is () {
            return <http:NotFound>{
                body: {
                    message: string `Patient ID ${uniquePatientId} not found`
                }
            };
        }
        log:printInfo(string `Returning mappings ${mappings.toBalString()} for patient ID: ${uniquePatientId}`);
        
        // Convert to FHIR Parameters format
        r4:ParametersParameter[] parameters = [];
        
        foreach SystemPatientMapping mapping in mappings {
            r4:ParametersParameter[] parts = [];
            
            parts.push({
                name: "sourceSystem",
                valueString: mapping.systemId
            });
            
            parts.push({
                name: "candidateId",
                valueString: mapping.systemPatientId
            });
            
            r4:ParametersParameter param = {
                name: "candidate",
                part: parts
            };
            
            parameters.push(param);
        }
        
        r4:Parameters fhirParameters = {
            resourceType: "Parameters",
            'parameter: parameters
        };
        
        return fhirParameters;
    }

    resource function post [string uniquePatientId]/mappings(SystemPatientMapping newMapping) returns SystemPatientMapping|http:BadRequest|http:Conflict|http:Created {
        log:printInfo(string `Received request to add mapping for patient ID: ${uniquePatientId}, mapping: ${newMapping.toBalString()}`);

        // Validate the input
        if newMapping.systemPatientId.trim() == "" || newMapping.systemId.trim() == "" || newMapping.resourceUrl.trim() == "" {
            return <http:BadRequest>{
                body: {
                    message: "System patient ID, system ID, and resource URL cannot be empty"
                }
            };
        }

        lock {
            // Get existing mappings or create new array
            SystemPatientMapping[] existingMappings;
            if patientMappingStore.hasKey(uniquePatientId) {
                SystemPatientMapping[]? mappingsOpt = patientMappingStore.get(uniquePatientId);
                existingMappings = mappingsOpt ?: [];
            } else {
                existingMappings = [];
            }

            // Check if mapping already exists to avoid duplicates
            foreach SystemPatientMapping mapping in existingMappings {
                if mapping.systemPatientId == newMapping.systemPatientId && mapping.systemId == newMapping.systemId {
                    return <http:Conflict>{
                        body: {
                            message: string `Mapping already exists for system patient ID ${newMapping.systemPatientId} in system ${newMapping.systemId}`
                        }
                    };
                }
            }

            // Add the new mapping
            existingMappings.push(newMapping);
            patientMappingStore[uniquePatientId] = existingMappings;

            log:printInfo(string `Successfully added mapping for patient ID: ${uniquePatientId}`);

            return <http:Created>{
                body: newMapping
            };
        }
    }

    function getMatchingPatients(international401:Patient patient) returns error|r4:BundleEntry[] {
        r4:BundleEntry[] matchedPatients = [];
        
        // Extract search criteria from the input patient
        string? searchFirstName = ();
        string? searchLastName = ();
        
        if patient.name is r4:HumanName[] {
            r4:HumanName[] names = <r4:HumanName[]>patient.name;
            if names.length() > 0 {
                r4:HumanName firstName = names[0];
                if firstName.given is string[] {
                    string[] givenNames = <string[]>firstName.given;
                    if givenNames.length() > 0 {
                        searchFirstName = givenNames[0];
                    }
                }
                searchLastName = firstName.family;
            }
        }
        string? searchGender = patient.gender;
        string? searchDateOfBirth = patient.birthDate;
        
        log:printInfo(string `Searching for patients with: firstName=${searchFirstName ?: "N/A"}, lastName=${searchLastName ?: "N/A"}, gender=${searchGender ?: "N/A"}, dob=${searchDateOfBirth ?: "N/A"}`);
        
        // Search through all patient mappings
        foreach string uniquePatientId in patientMappingStore.keys() {
            SystemPatientMapping[]? mappings = patientMappingStore.get(uniquePatientId);
            if mappings is () {
                continue;
            }
            
            // Check each mapping for matches
            foreach SystemPatientMapping mapping in mappings {
                int matchScore = 0;
                boolean isMatch = false;
                
                // Exact match on first name (case insensitive)
                if searchFirstName is string && mapping.firstName.toLowerAscii() == searchFirstName.toLowerAscii() {
                    matchScore += 30;
                    isMatch = true;
                }
                
                // Exact match on last name (case insensitive)
                if searchLastName is string && mapping.lastName is string {
                    string lastName = <string>mapping.lastName;
                    if lastName.toLowerAscii() == searchLastName.toLowerAscii() {
                        matchScore += 30;
                        isMatch = true;
                    }
                }
                
                // Exact match on date of birth
                if searchDateOfBirth is string && mapping.dateOfBirth == searchDateOfBirth {
                    matchScore += 25;
                    isMatch = true;
                }
                
                // Exact match on gender
                if searchGender is string && mapping.gender.toLowerAscii() == searchGender.toLowerAscii() {
                    matchScore += 15;
                }
                
                // Only include if we have a meaningful match (score >= 25 indicates at least one strong match)
                if isMatch && matchScore >= 25 {
                    log:printInfo(string `Found match for patient ${uniquePatientId} with score ${matchScore}: ${mapping.firstName} ${mapping.lastName ?: ""}`);
                    
                    // Create FHIR Patient resource from mapping
                    international401:Patient matchedPatient = {
                        resourceType: "Patient",
                        id: uniquePatientId,
                        name: [
                            {
                                family: mapping.lastName,
                                given: [mapping.firstName]
                            }
                        ],
                        gender: <international401:PatientGender>mapping.gender,
                        birthDate: mapping.dateOfBirth
                    };
                    
                    // Add address if available
                    if mapping.address is string {
                        matchedPatient.address = [
                            {
                                text: mapping.address
                            }
                        ];
                    }
                    
                    // Add phone if available
                    if mapping.phoneNumber is string {
                        matchedPatient.telecom = [
                            {
                                system: "phone",
                                value: mapping.phoneNumber
                            }
                        ];
                    }
                    
                    // Create bundle entry with match score
                    r4:BundleEntry entry = {
                        'resource: matchedPatient,
                        search: {
                            mode: "match",
                            score: <decimal>matchScore / 100.0 // Normalize score to 0-1 range
                        }
                    };
                    
                    matchedPatients.push(entry);
                }
            }
        }
        
        // Sort by match score (highest first)
        r4:BundleEntry[] sortedMatches = matchedPatients.sort(array:DESCENDING, isolated function(r4:BundleEntry entry) returns decimal {
            return entry.search?.score ?: 0.0;
        });
        
        log:printInfo(string `Found ${sortedMatches.length()} matching patients`);
        return sortedMatches;
    }
}

isolated function throwFHIRError(string message, error? cause) returns r4:FHIRError {
    if cause is error {
        return r4:createFHIRError(message = message, errServerity = r4:ERROR,
                code = r4:TRANSIENT_EXCEPTION, diagnostic = cause.detail().toString(), cause = cause, httpStatusCode = http:STATUS_BAD_REQUEST);
    }
    return r4:createFHIRError(message = message, errServerity = r4:ERROR,
            code = r4:TRANSIENT_EXCEPTION, httpStatusCode = http:STATUS_BAD_REQUEST);
}
