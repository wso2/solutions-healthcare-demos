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

import ballerinax/health.clients.fhir as fhirClient;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhirr4;
import ballerinax/health.fhir.r4.international401;

public type Location international401:Location;

public type Appointment international401:Appointment;

configurable string cernerUrl = ?;
configurable string tokenUrl = ?;
configurable string clientId = ?;
configurable string clientSecret = ?;
configurable string[] scopes = ?;

// Create a FHIR client configs for practitioner ,slot, location and appointment
fhirClient:FHIRConnectorConfig cernerConfig = {
    baseURL: cernerUrl,
    mimeType: fhirClient:FHIR_JSON,
    authConfig: {
        tokenUrl: tokenUrl,
        clientId: clientId,
        clientSecret: clientSecret,
        scopes: scopes
    }
};

final fhirClient:FHIRConnector fhirConnectorObj = check new (cernerConfig);

service / on new fhirr4:Listener(8081, practitionerApiConfig) {

    isolated resource function get fhir/r4/Practitioner(r4:FHIRContext fhirContext) returns r4:Bundle|error {

        map<string[]> queryParams = {};

        // Fetch the search parameter: family
        r4:StringSearchParameter[]|r4:FHIRTypeError? familyArray = fhirContext.getStringSearchParameter("family");
        if familyArray is r4:StringSearchParameter[] && familyArray.length() > 0 {
            queryParams["family"] = [familyArray[0].value];
        }

        // Fetch the search parameter: given
        r4:StringSearchParameter[]|r4:FHIRTypeError? givenArray = fhirContext.getStringSearchParameter("given");
        if givenArray is r4:StringSearchParameter[] && givenArray.length() > 0 {
            queryParams["given"] = [givenArray[0].value];
        }

        fhirClient:FHIRResponse searchResponse = check fhirConnectorObj->search("Practitioner", queryParams);

        return searchResponse.'resource.cloneWithType();
    }

}

service / on new fhirr4:Listener(8082, slotApiConfig) {
    isolated resource function get fhir/r4/Slot(r4:FHIRContext fhirContext) returns json[]|r4:Bundle|error|error {
        map<string[]> queryParams = {};
        r4:BundleEntry[] newBundleEntry = [];

        // Fetch the search parameter: practitioner
        r4:StringSearchParameter[]|r4:FHIRTypeError? practitionerArray = fhirContext.getStringSearchParameter("practitioner");
        if practitionerArray is r4:StringSearchParameter[] && practitionerArray.length() > 0 {
            queryParams["practitioner"] = [practitionerArray[0].value];
        }

        // Fetch the search parameter: startDate
        r4:StringSearchParameter[]|r4:FHIRTypeError? startDateArray = fhirContext.getStringSearchParameter("startDate");

        if (startDateArray is r4:StringSearchParameter[] && startDateArray.count() > 0) {
            //construct date to Cerner accepting format
            queryParams["start"] = [string `ge${startDateArray[0].value}T06:00:00Z`, string `lt${startDateArray[0].value}T23:55:55Z`];
        }

        queryParams["service-type"] = ["https://fhir.cerner.com/ec2458f2-1e24-41c8-b71b-0e701af7583d/codeSet/14249|4047611"];
        queryParams["_count"] = ["40"];

        fhirClient:FHIRResponse searchResponse = check fhirConnectorObj->search("Slot", queryParams);

        //From the Slot Bundle extract the slots for the selected two locations
        r4:Bundle|error resourceResponse = searchResponse.'resource.cloneWithType();
        if resourceResponse is r4:Bundle {
            r4:BundleEntry[]? optionalEntries = resourceResponse.entry;
            if optionalEntries is r4:BundleEntry[] {
                foreach var entry in optionalEntries {
                    json|error resourceEntry = entry["resource"].toJson();

                    if resourceEntry is json {
                        json|error resourceEntryExtension = check resourceEntry.extension;

                        if resourceEntryExtension is json[] {
                            foreach var ext in resourceEntryExtension {
                                if ext is map<anydata> {
                                    if ext["valueReference"] is map<anydata> {
                                        json|error location = check ext["valueReference"].reference;

                                        if location == "Location/25442717" || location == "Location/32216061" {
                                            r4:BundleEntry newEntry = {
                                                'resource: resourceEntry
                                            };
                                            newBundleEntry.push(newEntry);
                                        }

                                    }
                                }
                            }

                        }
                    }

                }
            }
        }

        // Construct a new Slot Bundle that has slots only from the selected locations
        r4:Bundle newBundle = {
            resourceType: "Bundle",
            entry: newBundleEntry
            ,
            'type: "searchset"
        };
        return newBundle;
    }
}

service / on new fhirr4:Listener(8084, locationApiConfig) {

    isolated resource function get fhir/r4/Location/[string id](r4:FHIRContext fhirContext) returns Location|error {

        fhirClient:FHIRResponse readByIdResponse = check fhirConnectorObj->getById("Location", id);
        return readByIdResponse.'resource.cloneWithType(Location);
    }
}

service / on new fhirr4:Listener(8083, appointmentApiConfig) {
    isolated resource function post fhir/r4/Appointment(r4:FHIRContext fhirContext, json appointment) returns int|error {

        fhirClient:FHIRResponse postResponse = check fhirConnectorObj->create(appointment);
        return postResponse.httpStatusCode;
    }
}
