import ballerina/log;
import ballerina/time;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

// Orders arrive as ServiceRequests on the lab's FHIR server (placed there by the integration).
// Releasing an order files Observations + a final DiagnosticReport on the lab's FHIR server, marks the
// order completed, and notifies the integration — the "lab report ready" arrow in the diagram.

# The lab's recent orders as a FHIR `searchset` Bundle: the 30 newest ServiceRequests (search mode `match`),
# each followed by what the lab console needs to show it (search mode `include`) — its Patient, its Specimen once
# collected and its DiagnosticReport once resulted. One search brings the orders and their reports
# (`_revinclude`); patients and specimens are read and added here.
#
# + return - the Bundle, or an error if the lab FHIR server cannot be searched
isolated function recentOrders() returns r4:Bundle|error {
    r4:Bundle bundle = check searchBundle("ServiceRequest",
            {"_sort": ["-authored"], "_count": ["30"], "_revinclude": ["DiagnosticReport:based-on"]});
    international401:ServiceRequest[] serviceRequests = from anydata r in resourcesOfType(bundle, "ServiceRequest")
        where r is international401:ServiceRequest select r;
    international401:DiagnosticReport[] reports = from anydata r in resourcesOfType(bundle, "DiagnosticReport")
        where r is international401:DiagnosticReport select r;

    r4:BundleEntry[] entries = [];
    string[] included = [];
    foreach international401:ServiceRequest sr in serviceRequests {
        entries.push({fullUrl: string `${labFhirBaseUrl}/ServiceRequest/${sr.id ?: ""}`, 'resource: sr, search: {mode: "match"}});
        string patientId = referenceId(sr.subject.reference ?: "");
        if included.indexOf("Patient/" + patientId) is () {
            international401:Patient|error patient = readPatient(patientId);
            if patient is international401:Patient {
                included.push("Patient/" + patientId);
                entries.push(includeEntry("Patient", patientId, patient));
            }
        }
        string? specimenId = specimenIdOf(sr);
        if specimenId is string {
            international401:Specimen|error specimen = readSpecimen(specimenId);
            if specimen is international401:Specimen {
                entries.push(includeEntry("Specimen", specimenId, specimen));
            }
        }
        foreach international401:DiagnosticReport report in reports {
            if basedOnContains(report, sr.id ?: "") {
                entries.push(includeEntry("DiagnosticReport", report.id ?: "", report));
            }
        }
    }
    return {'type: "searchset", total: serviceRequests.length(), timestamp: time:utcToString(time:utcNow()), entry: entries};
}

isolated function includeEntry(string resourceType, string id, anydata 'resource) returns r4:BundleEntry =>
    {fullUrl: string `${labFhirBaseUrl}/${resourceType}/${id}`, 'resource, search: {mode: "include"}};

# The patient arrived and gave a sample: files a Specimen for the order, links it from the order, and
# sends the integration a FHIR message with both (it completes the patient's lab-visit task).
#
# + serviceRequestId - the lab's ServiceRequest id
# + return - the Specimen as filed and whether the integration accepted the notification, `WrongOrderState` if
# the specimen was already collected or the order is resulted, or an error if the lab FHIR server rejects it
isolated function collectSpecimen(string serviceRequestId)
        returns [international401:Specimen, boolean]|WrongOrderState|error {
    international401:ServiceRequest sr = check readServiceRequest(serviceRequestId);
    if sr.status == "completed" || specimenIdOf(sr) is string {
        return error WrongOrderState("The specimen for this order has already been collected");
    }
    string collectedAt = time:utcToString(time:utcNow());
    international401:Specimen specimen = {
        status: "available",
        'type: {coding: [{system: "http://snomed.info/sct", code: "122555007", display: "Venous blood specimen"}],
            text: "Venous blood"},
        subject: sr.subject,
        request: [{reference: string `ServiceRequest/${serviceRequestId}`}],
        receivedTime: collectedAt,
        collection: {collectedDateTime: collectedAt, method: {text: "Venipuncture"},
            bodySite: {text: "Antecubital vein"}}
    };
    international401:ServiceRequest linked = sr.clone();
    linked.specimen = [{reference: "urn:uuid:specimen"}];
    r4:Bundle response = check submitTransaction([
        {fullUrl: "urn:uuid:specimen", 'resource: specimen, request: {method: "POST", url: "Specimen"}},
        {'resource: linked, request: {method: "PUT", url: string `ServiceRequest/${serviceRequestId}`}}
    ]);
    string specimenId = check idAtEntry(response, 0, "Specimen");
    log:printInfo("Specimen collected", serviceRequestId = serviceRequestId, specimenId = specimenId);
    international401:Specimen filed = check readSpecimen(specimenId);
    r4:Bundle message = labMessage(EVENT_SPECIMEN_COLLECTED, "Specimen collected", string `Specimen/${specimenId}`,
            [filed, check readServiceRequest(serviceRequestId)]);
    return [filed, notifyIntegration(EVENT_SPECIMEN_COLLECTED, message)];
}

# Runs an order: files a result for every analyte of every ordered test, a final report, and the order
# marked completed, all in one transaction; then sends the integration a FHIR message with the report, its
# Observations and the order.
#
# + serviceRequestId - the lab's ServiceRequest id
# + return - the final DiagnosticReport as filed and whether the integration accepted the notification,
# `AlreadyResulted` if the order is already completed, `WrongOrderState` if no specimen has been collected, or an
# error if the order cannot be read, has no test this lab runs, or the transaction fails
isolated function releaseOrder(string serviceRequestId)
        returns [international401:DiagnosticReport, boolean]|AlreadyResulted|WrongOrderState|error {
    international401:ServiceRequest sr = check readServiceRequest(serviceRequestId);
    if sr.status == "completed" {
        return error AlreadyResulted("already resulted");
    }
    string? specimenId = specimenIdOf(sr);
    if specimenId is () {
        return error WrongOrderState("The patient has not been to the lab yet: collect the specimen first");
    }
    string patientRef = sr.subject.reference ?: "";
    international401:Patient patient = check readPatient(referenceId(patientRef));
    boolean female = patient.gender == "female";
    map<decimal> profile = profileFor(mrnOf(patient));

    string now = time:utcToString(time:utcNow());
    string effective = specimenCollectedAt(specimenId) ?: now;
    r4:BundleEntry[] entries = [];
    r4:Reference[] resultRefs = [];
    string[] seen = [];
    foreach OrderedTest test in orderedTests(sr) {
        foreach string key in TEST_ANALYTES[test.code] ?: [] {
            LabAnalyte? analyte = analyteByKey(key);
            decimal? value = profile[key];
            if analyte is () || value is () || seen.indexOf(key) is int {
                continue;
            }
            seen.push(key);
            string fullUrl = string `urn:uuid:obs-${key}`;
            entries.push({
                fullUrl,
                'resource: observationFor(analyte, value, female, patientRef, serviceRequestId, specimenId, effective, now),
                request: {method: "POST", url: "Observation"}
            });
            resultRefs.push({reference: fullUrl});
        }
    }
    if resultRefs.length() == 0 {
        return error(string `ServiceRequest/${serviceRequestId} has no tests this lab can run`);
    }
    international401:DiagnosticReport report = {
        status: "final",
        category: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB", display: "Laboratory"}]}],
        code: {text: "Biomarker panel"},
        subject: {reference: patientRef},
        basedOn: [{reference: string `ServiceRequest/${serviceRequestId}`}],
        specimen: [{reference: string `Specimen/${specimenId}`}],
        effectiveDateTime: effective,
        issued: now,
        performer: [{reference: string `Organization/${labOrganizationId}`, display: labDisplayName}],
        result: resultRefs
    };
    entries.push({fullUrl: "urn:uuid:report", 'resource: report, request: {method: "POST", url: "DiagnosticReport"}});
    international401:ServiceRequest completed = sr.clone();
    completed.status = "completed";
    entries.push({'resource: completed, request: {method: "PUT", url: string `ServiceRequest/${serviceRequestId}`}});

    r4:Bundle response = check submitTransaction(entries);
    string reportId = check idAtEntry(response, entries.length() - 2, "DiagnosticReport");
    log:printInfo("Lab order resulted", serviceRequestId = serviceRequestId, diagnosticReportId = reportId,
            observations = resultRefs.length());

    // The Observations are the transaction's first entries; the message carries them as the server stored them.
    string[] observationIds = [];
    foreach int i in 0 ..< resultRefs.length() {
        observationIds.push(check idAtEntry(response, i, "Observation"));
    }
    r4:Bundle observationPage = check searchBundle("Observation",
            {"_id": [string:'join(",", ...observationIds)], "_count": [observationIds.length().toString()]});
    international401:Observation[] observations = from anydata r in resourcesOfType(observationPage, "Observation")
        where r is international401:Observation select r;
    international401:DiagnosticReport filedReport = check readDiagnosticReport(reportId);
    r4:Bundle message = labMessage(EVENT_RESULTS_READY, "Results ready", string `DiagnosticReport/${reportId}`,
            [filedReport, ...observations, check readServiceRequest(serviceRequestId)]);
    return [filedReport, notifyIntegration(EVENT_RESULTS_READY, message)];
}

# Builds one lab result, with the reference range and H/L/N flag for the patient's sex.
#
# + analyte - what was measured
# + value - the result
# + female - whether to use the female reference range
# + patientRef - the patient reference, e.g. `Patient/123`
# + serviceRequestId - the order the result fulfils
# + specimenId - the specimen it was measured on
# + effective - when the specimen was collected
# + now - the result timestamp
# + return - the Observation
isolated function observationFor(LabAnalyte analyte, decimal value, boolean female, string patientRef,
        string serviceRequestId, string specimenId, string effective, string now) returns international401:Observation {
    decimal? low = female && analyte.lowFemale is decimal ? analyte.lowFemale : analyte.low;
    decimal? high = female && analyte.highFemale is decimal ? analyte.highFemale : analyte.high;
    international401:ObservationReferenceRange range = {};
    if low is decimal {
        range.low = {value: low, unit: analyte.unit, system: UCUM, code: analyte.ucum};
    }
    if high is decimal {
        range.high = {value: high, unit: analyte.unit, system: UCUM, code: analyte.ucum};
    }
    string flag = high is decimal && value > high ? "H" : (low is decimal && value < low ? "L" : "N");
    string flagDisplay = flag == "H" ? "High" : (flag == "L" ? "Low" : "Normal");
    return {
        status: "final",
        category: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory", display: "Laboratory"}]}],
        code: {coding: [{system: LOINC, code: analyte.code, display: analyte.display}]},
        subject: {reference: patientRef},
        basedOn: [{reference: string `ServiceRequest/${serviceRequestId}`}],
        specimen: {reference: string `Specimen/${specimenId}`},
        effectiveDateTime: effective,
        issued: now,
        performer: [{reference: string `Organization/${labOrganizationId}`, display: labDisplayName}],
        valueQuantity: {value, unit: analyte.unit, system: UCUM, code: analyte.ucum},
        interpretation: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: flag, display: flagDisplay}]}],
        referenceRange: [range]
    };
}

# The specimen collected for an order, read from the order's `specimen` reference.
#
# + serviceRequest - the ServiceRequest
# + return - the Specimen id, or nil before collection
isolated function specimenIdOf(international401:ServiceRequest serviceRequest) returns string? {
    r4:Reference[] specimens = serviceRequest.specimen ?: [];
    string? reference = specimens.length() > 0 ? specimens[0].reference : ();
    return reference is string ? referenceId(reference) : ();
}

# When a specimen was collected.
#
# + specimenId - the Specimen id
# + return - the collection time, or nil if the specimen cannot be read
isolated function specimenCollectedAt(string specimenId) returns string? {
    international401:Specimen|error specimen = readSpecimen(specimenId);
    return specimen is error ? () : specimen.collection?.collectedDateTime;
}
