// Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
// This software is the property of WSO2 LLC. and its suppliers, if any.
// Dissemination of any information or reproduction of any material contained
// herein is strictly forbidden, unless permitted by WSO2 in accordance with
// the WSO2 Software License available at: https://wso2.com/licenses/eula/3.2
// For specific language governing the permissions and limitations under
// this license, please see the license as well as any agreement you’ve
// entered into with WSO2 governing the purchase of this software and any
// associated services.
//
// This file is auto-generated by WSO2 Healthcare Team for managing utility functions.
// Developers are allowed modify this file as per the requirement.
import ballerinax/health.clients.fhir as fhirClient;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhirr4;
import ballerinax/health.fhir.r4.international401;

public type Location international401:Location;

public type Appointment international401:Appointment;

string practitionerBaseUrl = "http://localhost:9092/fhir/r4";
string slotBaseUrl = "http://localhost:9098/fhir/r4";
string locationBaseUrl = "http://localhost:9095/fhir/r4";
string appointmentBaseUrl = "http://localhost:9099/fhir/r4";

// Create a FHIR client configs for practitioner ,slot, location and appointment
fhirClient:FHIRConnectorConfig practitionerConfig = {
    baseURL: practitionerBaseUrl,
    mimeType: fhirClient:FHIR_JSON
};

fhirClient:FHIRConnectorConfig slotConfig = {
    baseURL: slotBaseUrl,
    mimeType: fhirClient:FHIR_JSON
};

fhirClient:FHIRConnectorConfig locationConfig = {
    baseURL: locationBaseUrl,
    mimeType: fhirClient:FHIR_JSON
};

fhirClient:FHIRConnectorConfig appointmentConfig = {
    baseURL: appointmentBaseUrl,
    mimeType: fhirClient:FHIR_JSON
};

final fhirClient:FHIRConnector fhirPractitionerObj = check new (practitionerConfig);
final fhirClient:FHIRConnector fhirSlotObj = check new (slotConfig);
final fhirClient:FHIRConnector fhirLocationObj = check new (locationConfig);
final fhirClient:FHIRConnector fhirAppointmentObj = check new (appointmentConfig);

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

        fhirClient:FHIRResponse searchResponse = check fhirPractitionerObj->search("Practitioner", queryParams);

        return searchResponse.'resource.cloneWithType();
    }

}

service / on new fhirr4:Listener(8082, slotApiConfig) {
    isolated resource function get fhir/r4/Slot(r4:FHIRContext fhirContext) returns json[]|r4:Bundle|error|error {
        map<string[]> queryParams = {};
        r4:BundleEntry[] newBundleEntry = [];

        r4:StringSearchParameter[]|r4:FHIRTypeError? practitionerArray = fhirContext.getStringSearchParameter("practitioner");
        if practitionerArray is r4:StringSearchParameter[] && practitionerArray.length() > 0 {
            queryParams["practitioner"] = [practitionerArray[0].value];
        }

        r4:StringSearchParameter[]|r4:FHIRTypeError? startDateArray = fhirContext.getStringSearchParameter("startDate");

        if (startDateArray is r4:StringSearchParameter[] && startDateArray.count() > 0) {
            queryParams["start"] = [string `ge${startDateArray[0].value}T06:00:00Z`, string `lt${startDateArray[0].value}T23:55:55Z`];
        }

        queryParams["service-type"] = ["https://fhir.cerner.com/ec2458f2-1e24-41c8-b71b-0e701af7583d/codeSet/14249|4047611"];
        queryParams["_count"] = ["40"];

        fhirClient:FHIRResponse searchResponse = check fhirSlotObj->search("Slot", queryParams);

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

                                        if location == "Location/25442717" {
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

        fhirClient:FHIRResponse readByIdResponse = check fhirLocationObj->getById("Location", id);
        return readByIdResponse.'resource.cloneWithType(Location);
    }
}

service / on new fhirr4:Listener(8083, appointmentApiConfig) {
    isolated resource function post fhir/r4/Appointment(r4:FHIRContext fhirContext, json appointment) returns int|error {

        fhirClient:FHIRResponse postResponse = check fhirAppointmentObj->create(appointment);
        return postResponse.httpStatusCode;
    }
}