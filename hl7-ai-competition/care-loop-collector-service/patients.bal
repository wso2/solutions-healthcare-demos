import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

isolated function extractPatients(json bundle) returns Patient[] {
    Patient[] patients = [];
    r4:Bundle|error typedBundle = bundle.cloneWithType(r4:Bundle);
    if typedBundle is error {
        return patients;
    }
    foreach r4:BundleEntry entry in typedBundle.entry ?: [] {
        anydata|r4:FHIRWireFormat? entryResource = entry?.'resource;
        international401:Patient|error patientResource = entryResource.cloneWithType(international401:Patient);
        string? id = patientResource is international401:Patient ? patientResource.id : ();
        if patientResource is error || id is () {
            continue;
        }
        patients.push({id, name: extractPatientName(patientResource, id)});
    }
    return patients;
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
