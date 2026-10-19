import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// Everything the integration exchanges with the reference lab goes through this file, as typed FHIR R4
// resources (Patient, ServiceRequest, Specimen, DiagnosticReport, Observation): what is built is checked
// against the resource's structure at compile time, and what the lab returns is checked when it is read.
// The lab is a separate FHIR system: it has its own patient ids, so the EHR patient is matched to (or
// registered with) the lab by MRN before an order is placed.

# Finds the patient in the lab by MRN, registering them if the lab has never seen them. The MRN keeps
# the EHR's identifier system, so the lab can tell which clinic the patient belongs to. Safe to retry.
#
# + ehrPatient - the patient as read from the EHR
# + mrnSystem - the EHR's MRN identifier system
# + return - the lab's patient id, or an error if the patient has no MRN or the lab rejects it
isolated function ensureLabPatient(international401:Patient ehrPatient, string mrnSystem) returns string|error {
    string? mrn = identifierValue(ehrPatient.identifier, mrnSystem);
    if mrn is () {
        return error("The EHR patient has no MRN, so it cannot be matched with the lab");
    }
    international401:Patient labPatient = {identifier: [{system: mrnSystem, value: mrn}]};
    r4:HumanName[]? name = ehrPatient.name;
    if name is r4:HumanName[] {
        labPatient.name = name;
    }
    international401:PatientGender? gender = ehrPatient.gender;
    if gender is international401:PatientGender {
        labPatient.gender = gender;
    }
    r4:date? birthDate = ehrPatient.birthDate;
    if birthDate is r4:date {
        labPatient.birthDate = birthDate;
    }
    return createOnce(labFhir, labPatient, mrnSystem, mrn);
}

# The specimen the lab collected for an order, if it has collected one. The lab links the specimen
# from its ServiceRequest, so this is two reads rather than a search.
#
# + labServiceRequestId - the lab's ServiceRequest id
# + return - the Specimen, nil while the patient has not been to the lab, or an error if the lab cannot be read
isolated function findSpecimen(string labServiceRequestId) returns international401:Specimen?|error {
    international401:ServiceRequest serviceRequest = check (check readLabResource("ServiceRequest", labServiceRequestId))
        .cloneWithType();
    r4:Reference[] specimens = serviceRequest.specimen ?: [];
    string? specimenRef = specimens.length() > 0 ? specimens[0].reference : ();
    if specimenRef is () {
        return ();
    }
    string specimenId = check idFromLocation(specimenRef);
    international401:Specimen specimen = check (check readLabResource("Specimen", specimenId)).cloneWithType();
    return specimen;
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
    international401:ServiceRequest serviceRequest = labServiceRequest(string `Patient/${labPatientId}`,
            placerOrderId, testCodes, {display: practitionerName}, note);
    return createOnce(labFhir, serviceRequest, PLACER_ORDER_SYSTEM, placerOrderId);
}

# The lab's report for an order, if it has produced one. Looked up by reference to the order:
# `based-on=ServiceRequest/{id}` (the `:identifier` modifier is not supported by every server).
#
# + labServiceRequestId - the lab's ServiceRequest id
# + return - the report, or nil when the lab has no report yet
isolated function findLabReport(string labServiceRequestId) returns international401:DiagnosticReport?|error {
    json[] reports = check searchResources(labFhir, "DiagnosticReport",
            {"based-on": [string `ServiceRequest/${labServiceRequestId}`]});
    return reports.length() > 0 ? check reports[0].cloneWithType() : ();
}

isolated function isFinalReportStatus(string? status) returns boolean =>
    status == "final" || status == "amended" || status == "corrected";

# Reads the Observations a lab report references.
#
# + report - the lab's DiagnosticReport
# + return - its Observations
isolated function reportObservations(international401:DiagnosticReport report)
        returns international401:Observation[]|error {
    string[] observationIds = from r4:Reference ref in report.result ?: []
        let string? reference = ref.reference
        where reference is string
        select check idFromLocation(reference);
    if observationIds.length() == 0 {
        return [];
    }
    json[] observations = check searchResources(labFhir, "Observation", {"_id": [string:'join(",", ...observationIds)]});
    return <international401:Observation[]>check typedResources(observations, ObservationList);
}

# Flattens lab Observations into result values, including the lab's own reference ranges.
#
# + observations - the lab's Observations
# + return - one value per Observation that has a LOINC code and a numeric value
isolated function labResultValues(international401:Observation[] observations) returns LabResultValue[] {
    LabResultValue[] values = [];
    foreach international401:Observation observation in observations {
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

# Reads one resource from the lab.
#
# + resourceType - the resource type
# + id - the resource's id in the lab
# + return - the resource as the lab returned it, ready to be read as its FHIR type
isolated function readLabResource(string resourceType, string id) returns json|error {
    fhir:FHIRResponse response = check labFhir->getById(resourceType, id);
    return <json>response.'resource;
}
