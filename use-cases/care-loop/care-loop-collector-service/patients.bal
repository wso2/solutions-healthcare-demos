import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

# Converts a single FHIR Patient resource (as returned by FHIRConnector's getById) into this service's Patient shape.
#
# + patientResourceJson - the raw Patient resource json returned by FHIRConnector
# + fallbackId - used as both the id and display-name fallback if the resource is missing either
# + return - the converted Patient, or an error if the json isn't a valid Patient resource
isolated function extractPatient(json patientResourceJson, string fallbackId) returns Patient|error {
    international401:Patient patientResource = check patientResourceJson.cloneWithType(international401:Patient);
    string id = patientResource.id ?: fallbackId;
    return {id, name: extractPatientName(patientResource, id)};
}

isolated function extractPatientName(international401:Patient patientResource, string fallbackId) returns string {
    r4:HumanName[]? names = patientResource.name;
    if names is () || names.length() == 0 {
        return fallbackId;
    }
    r4:HumanName name = names[0];

    if name.text is string {
        return <string>name.text;
    }

    string? family = name.family;
    string[]? givenList = name.given;
    string given = givenList is string[] && givenList.length() > 0 ? givenList[0] : "";
    if family is string && given != "" {
        return given + " " + family;
    }
    if family is string {
        return family;
    }
    if given != "" {
        return given;
    }
    return fallbackId;
}
