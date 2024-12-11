import ballerina/http;
import ballerina/log;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.validator;
import ballerinax/health.hl7v2.utils.v2tofhirr4;
import ballerinax/health.fhir.r4.international401;

# Mapper function to map health data to FHIR resources
#
# + eventType - health event type
# + payload - payload to be mapped
# + return - mapped FHIR resource or error
public isolated function mapToFhir(string eventType, anydata payload) returns anydata|r4:FHIRError {
    match eventType {
        "patient_data" => {
            Patient|error patientData = payload.cloneWithType();
            if patientData is error {
                return r4:createFHIRError("Error occurred while cloning the payload", r4:ERROR, r4:INVALID);
            }
            international401:Patient fhirPayload = mapPatient(patientData);
            r4:FHIRValidationError? validate = validator:validate(fhirPayload, international401:Patient);
            if validate is r4:FHIRValidationError {
                return r4:createFHIRError(validate.message(), r4:ERROR, r4:INVALID, cause = validate.cause(), errorType = r4:VALIDATION_ERROR, httpStatusCode = http:STATUS_BAD_REQUEST);
            }
            return fhirPayload;
        }
        "hl7_data" => {
            HL7Data|error hl7Data = payload.cloneWithType();
            if hl7Data is error {
                return r4:createFHIRError("Error occurred while cloning the payload", r4:ERROR, r4:INVALID);
            }
            json|error v2tofhirResult = v2tofhirr4:v2ToFhir(hl7Data.mllpStr);
            if v2tofhirResult is json {
                log:printInfo(string `FHIR resource mapped: ${v2tofhirResult.toJsonString()}`, mappedData = v2tofhirResult);
                r4:Bundle|error fhirPayload = v2tofhirResult.cloneWithType();
                if fhirPayload is r4:Bundle {
                    r4:BundleEntry[] entries = <r4:BundleEntry[]>fhirPayload.entry;
                    foreach var entry in entries {
                        map<anydata> fhirResource = <map<anydata>>entry?.'resource;
                        if fhirResource["resourceType"] == "Patient" {
                            log:printInfo(string `FHIR resource: ${fhirResource.toJsonString()}`, mappedData = fhirResource);
                            return fhirResource;
                        }
                    }
                }
            }
        }
        _ => {
            return r4:createFHIRError("Invalid data type", r4:ERROR, r4:INVALID);
        }
    }
}

# Dedicated function to map patient data to US Core Patient Profile
#
# + payload - patient data in custom format
# + return - US Core Patient Profile
public isolated function mapPatient(Patient payload) returns international401:Patient => {
    name: [
        {
            given: [payload.firstName],
            family: payload.lastName
        }
    ],
    meta: {
        versionId: payload.'version,
        lastUpdated: payload.lastUpdatedOn,
        'source: payload.originSource
    },
    text: {
        div: payload.description.details ?: "",
        status: <r4:StatusCode>payload.description.status

    },
    gender: <international401:PatientGender>payload.gender
,
    identifier: [
        {system: payload.identifiers[0].id_type.codes[0].system_source, value: payload.identifiers[0].id_value}
    ],
    address: from var locatoionDetailItem in payload.locatoionDetail
        select {
            country: locatoionDetailItem.nation,
            city: locatoionDetailItem.town,
            district: locatoionDetailItem.region,
            state: locatoionDetailItem.province,
            postalCode: locatoionDetailItem.zipCode,
            id: locatoionDetailItem.identifier
        },
    id: payload.patientId
};

