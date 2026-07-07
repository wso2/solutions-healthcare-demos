import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

# + patientName - display name extracted from the Patient resource, falling back to the patientId
# + ageSexSummary - e.g. "68F", for a compact narrative lead-in
public type PatientDisplay record {|
    string patientName;
    string ageSexSummary;
|};

# Deliberately just identity/demographics - deeper medical history is the risk-assessment agent's own job via its MCP toolkit.
isolated function patientDisplay(international401:Patient patient, string fallbackId, int age, "M"|"F" sex) returns PatientDisplay {
    return {patientName: extractPatientDisplayName(patient, fallbackId), ageSexSummary: age.toString() + sex};
}

isolated function extractPatientDisplayName(international401:Patient patient, string fallbackId) returns string {
    r4:HumanName[]? names = patient.name;
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
    return given != "" ? given : fallbackId;
}
