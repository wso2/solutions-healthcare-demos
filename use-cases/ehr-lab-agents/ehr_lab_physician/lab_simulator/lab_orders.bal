import ballerina/http;
import ballerina/log;
import ballerina/time;
import ballerinax/health.clients.fhir;

// Orders arrive as ServiceRequests on the lab's FHIR server (placed there by the integration).
// Releasing an order files Observations + a final DiagnosticReport on the lab's FHIR server, marks the
// order completed, and notifies the integration — the "lab report ready" arrow in the diagram.

# Lists recent orders with whether each has been resulted, in one search: the reports come back
# alongside their orders through `_revinclude`.
#
# + return - the 30 most recent orders, newest first, or an error if the lab FHIR server cannot be searched
isolated function recentOrders() returns LabOrder[]|error {
    map<string[]> query = {"_sort": ["-authored"], "_count": ["30"], "_revinclude": ["DiagnosticReport:based-on"]};
    fhir:FHIRResponse response = check labFhir->search("ServiceRequest", searchParameters = query);
    json bundle = <json>response.'resource;
    json[] serviceRequests = resourcesOfType(bundle, "ServiceRequest");
    json[] reports = resourcesOfType(bundle, "DiagnosticReport");

    map<string> patientNames = {};
    map<string?> patientMrns = {};
    LabOrder[] orders = [];
    foreach json sr in serviceRequests {
        string id = (check sr.id).toString();
        string patientId = referenceId((check sr.subject.reference).toString());
        if !patientNames.hasKey(patientId) {
            json|error patient = readResource("Patient", patientId);
            patientNames[patientId] = patient is error ? patientId : humanName(patient);
            patientMrns[patientId] = patient is error ? () : mrnOf(patient);
        }
        string? reportId = ();
        foreach json report in reports {
            if basedOnContains(report, id) {
                json|error reportIdValue = report.id;
                reportId = reportIdValue is string ? reportIdValue : ();
            }
        }
        json|error status = sr.status;
        json|error authoredOn = sr.authoredOn;
        json|error requester = sr.requester.display;
        string? specimenId = specimenIdOf(sr);
        string? collectedAt = specimenId is string ? specimenCollectedAt(specimenId) : ();
        orders.push({
            id,
            placerOrderId: identifierValue(sr, PLACER_ORDER_SYSTEM),
            patientId,
            patientName: patientNames[patientId] ?: patientId,
            mrn: patientMrns[patientId],
            tests: orderedTests(sr),
            authoredOn: authoredOn is string ? authoredOn : (),
            requester: requester is string ? requester : (),
            status: status == "completed" || reportId is string ? "resulted" : specimenId is string ? "collected" : "awaiting-patient",
            specimenId,
            collectedAt,
            reportId
        });
    }
    return orders;
}

# The patient arrived and gave a sample: files a Specimen for the order, links it from the order, and
# tells the integration (which completes the patient's lab-visit task).
#
# + serviceRequestId - the lab's ServiceRequest id
# + return - what was filed, `WrongOrderState` if the specimen was already collected or the order is
# resulted, or an error if the lab FHIR server rejects it
isolated function collectSpecimen(string serviceRequestId) returns CollectionResult|WrongOrderState|error {
    json sr = check readResource("ServiceRequest", serviceRequestId);
    if sr.status == "completed" || specimenIdOf(sr) is string {
        return error WrongOrderState("The specimen for this order has already been collected");
    }
    string collectedAt = time:utcToString(time:utcNow());
    map<json> linked = <map<json>>sr.clone();
    linked["specimen"] = [{reference: "urn:uuid:specimen"}];
    json[] entries = [
        {
            fullUrl: "urn:uuid:specimen",
            'resource: {
                resourceType: "Specimen",
                status: "available",
                'type: {coding: [{system: "http://snomed.info/sct", code: "122555007", display: "Venous blood specimen"}],
                    text: "Venous blood"},
                subject: check sr.subject,
                request: [{reference: string `ServiceRequest/${serviceRequestId}`}],
                receivedTime: collectedAt,
                collection: {collectedDateTime: collectedAt,
                    method: {text: "Venipuncture"}, bodySite: {text: "Antecubital vein"}}
            },
            request: {method: "POST", url: "Specimen"}
        },
        {'resource: linked, request: {method: "PUT", url: string `ServiceRequest/${serviceRequestId}`}}
    ];
    fhir:FHIRResponse response = check labFhir->'transaction({resourceType: "Bundle", 'type: "transaction", entry: entries});
    string specimenId = check idAtEntry(<json>response.'resource, 0, "Specimen");
    log:printInfo("Specimen collected", serviceRequestId = serviceRequestId, specimenId = specimenId);
    boolean notified = notifyIntegration({event: "specimen-collected", serviceRequestId, specimenId});
    return {serviceRequestId, specimenId, collectedAt, integrationNotified: notified};
}

# Runs an order: files a result for every analyte of every ordered test, a final report, and the order
# marked completed, all in one transaction; then notifies the integration.
#
# + serviceRequestId - the lab's ServiceRequest id
# + return - what was filed, `AlreadyResulted` if the order is already completed, `WrongOrderState` if
# no specimen has been collected, or an error if the order cannot be read, has no test this lab runs, or
# the transaction fails
isolated function releaseOrder(string serviceRequestId) returns ReleaseResult|AlreadyResulted|WrongOrderState|error {
    json sr = check readResource("ServiceRequest", serviceRequestId);
    if sr.status == "completed" {
        return error AlreadyResulted("already resulted");
    }
    string? specimenId = specimenIdOf(sr);
    if specimenId is () {
        return error WrongOrderState("The patient has not been to the lab yet: collect the specimen first");
    }
    string patientRef = (check sr.subject.reference).toString();
    json patient = check readResource("Patient", referenceId(patientRef));
    string? mrn = mrnOf(patient);
    boolean female = patient.gender == "female";
    map<decimal> profile = profileFor(mrn);

    string now = time:utcToString(time:utcNow());
    json[] entries = [];
    json[] resultRefs = [];
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
                'resource: observationFor(analyte, value, female, patientRef, serviceRequestId, specimenId, now),
                request: {method: "POST", url: "Observation"}
            });
            resultRefs.push({reference: fullUrl});
        }
    }
    if resultRefs.length() == 0 {
        return error(string `ServiceRequest/${serviceRequestId} has no tests this lab can run`);
    }
    entries.push({
        fullUrl: "urn:uuid:report",
        'resource: {
            resourceType: "DiagnosticReport",
            status: "final",
            category: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB", display: "Laboratory"}]}],
            code: {text: "Biomarker panel"},
            subject: {reference: patientRef},
            basedOn: [{reference: string `ServiceRequest/${serviceRequestId}`}],
            specimen: [{reference: string `Specimen/${specimenId}`}],
            effectiveDateTime: specimenCollectedAt(specimenId) ?: now,
            issued: now,
            performer: [{reference: string `Organization/${labOrganizationId}`, display: labDisplayName}],
            result: resultRefs
        },
        request: {method: "POST", url: "DiagnosticReport"}
    });
    map<json> completed = <map<json>>sr.clone();
    completed["status"] = "completed";
    entries.push({'resource: completed, request: {method: "PUT", url: string `ServiceRequest/${serviceRequestId}`}});

    fhir:FHIRResponse response = check labFhir->'transaction({resourceType: "Bundle", 'type: "transaction", entry: entries});
    string reportId = check idAtEntry(<json>response.'resource, entries.length() - 2, "DiagnosticReport");
    log:printInfo("Lab order resulted", serviceRequestId = serviceRequestId, diagnosticReportId = reportId,
            observations = resultRefs.length());

    boolean notified = notifyIntegration({event: "results-ready", serviceRequestId, diagnosticReportId: reportId,
        status: "final"});
    return {serviceRequestId, diagnosticReportId: reportId, observations: resultRefs.length(), integrationNotified: notified};
}

# Builds one lab result, with the reference range and H/L/N flag for the patient's sex.
#
# + analyte - what was measured
# + value - the result
# + female - whether to use the female reference range
# + patientRef - the patient reference, e.g. `Patient/123`
# + serviceRequestId - the order the result fulfils
# + specimenId - the specimen it was measured on
# + now - the result timestamp
# + return - the Observation resource
isolated function observationFor(LabAnalyte analyte, decimal value, boolean female, string patientRef,
        string serviceRequestId, string specimenId, string now) returns json {
    decimal? low = female && analyte.lowFemale is decimal ? analyte.lowFemale : analyte.low;
    decimal? high = female && analyte.highFemale is decimal ? analyte.highFemale : analyte.high;
    map<json> range = {};
    if low is decimal {
        range["low"] = {value: low, unit: analyte.unit, system: UCUM, code: analyte.ucum};
    }
    if high is decimal {
        range["high"] = {value: high, unit: analyte.unit, system: UCUM, code: analyte.ucum};
    }
    string flag = high is decimal && value > high ? "H" : (low is decimal && value < low ? "L" : "N");
    string flagDisplay = flag == "H" ? "High" : (flag == "L" ? "Low" : "Normal");
    return {
        resourceType: "Observation",
        status: "final",
        category: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory", display: "Laboratory"}]}],
        code: {coding: [{system: LOINC, code: analyte.code, display: analyte.display}]},
        subject: {reference: patientRef},
        basedOn: [{reference: string `ServiceRequest/${serviceRequestId}`}],
        specimen: {reference: string `Specimen/${specimenId}`},
        effectiveDateTime: specimenCollectedAt(specimenId) ?: now,
        issued: now,
        performer: [{reference: string `Organization/${labOrganizationId}`, display: labDisplayName}],
        valueQuantity: {value, unit: analyte.unit, system: UCUM, code: analyte.ucum},
        interpretation: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: flag, display: flagDisplay}]}],
        referenceRange: [range]
    };
}

# Tells the integration something happened to an order (specimen collected, results ready). A failure
# is logged, not raised: the lab's records are already filed, and the integration's fallback poller
# will find them.
#
# + notification - the event and the order it is about
# + return - whether the integration accepted the notification
isolated function notifyIntegration(map<json> notification) returns boolean {
    http:Response|error response = integrationClient->post("", notification, {"X-Lab-Api-Key": integrationWebhookApiKey});
    if response is error {
        log:printWarn("Could not notify the integration; its fallback poller will pick this up", response,
                event = notification["event"].toString());
        return false;
    }
    if response.statusCode >= 300 {
        log:printWarn("Integration refused the notification", statusCode = response.statusCode);
        return false;
    }
    return true;
}

# The specimen collected for an order, read from the order's `specimen` reference.
#
# + serviceRequest - the ServiceRequest
# + return - the Specimen id, or nil before collection
isolated function specimenIdOf(json serviceRequest) returns string? {
    string? reference = referenceAt(serviceRequest, "specimen");
    return reference is string ? referenceId(reference) : ();
}

# When a specimen was collected.
#
# + specimenId - the Specimen id
# + return - the collection time, or nil if the specimen cannot be read
isolated function specimenCollectedAt(string specimenId) returns string? {
    json|error specimen = readResource("Specimen", specimenId);
    if specimen is error {
        return ();
    }
    json|error collected = specimen.collection.collectedDateTime;
    return collected is string ? collected : ();
}
