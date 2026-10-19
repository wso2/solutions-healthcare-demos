import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// Everything the integration exchanges with the reference lab goes through this file.
// The lab is a separate FHIR system: it has its own patient ids, so the EHR patient is matched to
// (or registered with) the lab by MRN before an order is placed.

# Finds the patient in the lab by MRN, registering them if the lab has never seen them. The MRN keeps
# its EHR's identifier system, so patients from two EHRs never collide in the lab. Safe to retry.
#
# + ehrPatient - the patient as read from the EHR
# + mrnSystem - the EHR's MRN identifier system
# + return - the lab's patient id, or an error if the patient has no MRN or the lab rejects it
isolated function ensureLabPatient(international401:Patient ehrPatient, string mrnSystem) returns string|error {
    string? mrn = identifierValue(ehrPatient.identifier, mrnSystem);
    if mrn is () {
        return error("The EHR patient has no MRN, so it cannot be matched with the lab");
    }
    json labPatient = {
        resourceType: "Patient",
        identifier: [{system: mrnSystem, value: mrn}],
        name: ehrPatient.name.toJson(),
        gender: ehrPatient.gender,
        birthDate: ehrPatient.birthDate
    };
    return createOnce(labFhir, labPatient, mrnSystem, mrn);
}

# The specimen the lab collected for an order, if it has collected one. The lab links the specimen
# from its ServiceRequest, so this is two reads rather than a search.
#
# + labServiceRequestId - the lab's ServiceRequest id
# + return - the specimen id and its collection time, nil while the patient has not been to the lab,
# or an error if the lab cannot be read
isolated function findSpecimen(string labServiceRequestId) returns [string, string]?|error {
    fhir:FHIRResponse response = check labFhir->getById("ServiceRequest", labServiceRequestId);
    json serviceRequest = <json>response.'resource;
    string? specimenRef = jsonText(serviceRequest, "specimen", 0, "reference");
    if specimenRef is () {
        return ();
    }
    string specimenId = check idFromLocation(specimenRef);
    fhir:FHIRResponse specimenResponse = check labFhir->getById("Specimen", specimenId);
    json specimen = <json>specimenResponse.'resource;
    return [specimenId, jsonText(specimen, "collection", "collectedDateTime") ?: nowIso()];
}

# Places the order with the lab. Identified by the placer-order id, so a retry cannot order twice.
#
# + labPatientId - the patient's id in the lab
# + placerOrderId - the clinic's order id, which identifies the order in both systems
# + testCodes - catalog codes of the approved tests
# + practitionerName - the ordering physician, as shown to the lab
# + note - order note for the lab; omitted when blank
# + return - the lab's ServiceRequest id
isolated function submitLabOrder(string labPatientId, string placerOrderId, string[] testCodes,
        string practitionerName, string note) returns string|error {
    json serviceRequest = labServiceRequest(string `Patient/${labPatientId}`, placerOrderId, testCodes,
            {display: practitionerName}, note);
    return createOnce(labFhir, serviceRequest, PLACER_ORDER_SYSTEM, placerOrderId);
}

# The lab's report for an order, if it has produced one. Looked up by reference to the order:
# `based-on=ServiceRequest/{id}` (the `:identifier` modifier is not supported by every server).
#
# + labServiceRequestId - the lab's ServiceRequest id
# + return - the report as json, or nil when the lab has no report yet
isolated function findLabReport(string labServiceRequestId) returns json?|error {
    json[] reports = check searchResources(labFhir, "DiagnosticReport",
            {"based-on": [string `ServiceRequest/${labServiceRequestId}`]});
    return reports.length() > 0 ? reports[0] : ();
}

isolated function isFinalReportStatus(string? status) returns boolean =>
    status == "final" || status == "amended" || status == "corrected";

# Reads a lab report and the Observations it references.
#
# + diagnosticReportId - the lab's DiagnosticReport id
# + return - the report json and its observations' json
isolated function readLabReport(string diagnosticReportId) returns [json, json[]]|error {
    fhir:FHIRResponse response = check labFhir->getById("DiagnosticReport", diagnosticReportId);
    json report = <json>response.'resource;
    international401:DiagnosticReport typed = check report.cloneWithType();
    string[] observationIds = from r4:Reference ref in typed.result ?: []
        let string? reference = ref.reference
        where reference is string
        select check idFromLocation(reference);
    if observationIds.length() == 0 {
        return [report, []];
    }
    json[] observations = check searchResources(labFhir, "Observation", {"_id": [string:'join(",", ...observationIds)]});
    return [report, observations];
}

# Flattens lab Observations into result values, including the lab's own reference ranges.
#
# + observations - the lab's Observations as json
# + return - one value per Observation that has a LOINC code and a numeric value, or an error if the
# Observations cannot be read as FHIR resources
isolated function labResultValues(json[] observations) returns LabResultValue[]|error {
    international401:Observation[] typed =
        <international401:Observation[]>check typedResources(observations, ObservationList);
    LabResultValue[] values = [];
    foreach international401:Observation observation in typed {
        decimal? value = observation.valueQuantity?.value;
        string? code = codingCode(observation.code, LOINC);
        if value is () || code is () {
            continue;
        }
        Analyte? analyte = analyteByCode(code);
        international401:ObservationReferenceRange[] ranges = observation.referenceRange ?: [];
        values.push({
            code,
            name: analyte is Analyte ? analyte.name : conceptText(observation.code) ?: code,
            value,
            unit: observation.valueQuantity?.unit ?: (analyte is Analyte ? analyte.unit : ""),
            interpretation: interpretationCode(observation),
            referenceLow: ranges.length() > 0 ? ranges[0].low?.value : (),
            referenceHigh: ranges.length() > 0 ? ranges[0].high?.value : (),
            effectiveDate: dateOnly(observation.effectiveDateTime) ?: ""
        });
    }
    return values;
}
