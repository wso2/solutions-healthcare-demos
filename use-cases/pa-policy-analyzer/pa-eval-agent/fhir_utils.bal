import ballerina/log;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;
import ballerinax/health.clients.fhir as fhirClient;

isolated function getPatientClinicalSummary(string sessionId) returns string|error {
    EvalContext? ctx = getEvalContext(sessionId);
    if ctx is () {
        return error("No evaluation context found for session");
    }
    string patientId = ctx.patientId;

    map<string[]> medParams = {"patient": [patientId]};
    map<string[]> obsParams = {"patient": [patientId]};
    map<string[]> procParams = {"subject": [patientId]};

    json medBundle = {};
    json obsBundle = {};
    json procBundle = {};

    do {
        fhirClient:FHIRResponse medResp = check fhirConnectorObj->search("MedicationRequest", searchParameters = medParams);
        medBundle = <json>medResp.'resource;
    } on fail error e {
        log:printWarn("Failed to fetch MedicationRequests: " + e.message());
    }

    do {
        fhirClient:FHIRResponse obsResp = check fhirConnectorObj->search("Observation", searchParameters = obsParams);
        obsBundle = <json>obsResp.'resource;
    } on fail error e {
        log:printWarn("Failed to fetch Observations: " + e.message());
    }

    do {
        fhirClient:FHIRResponse procResp = check fhirConnectorObj->search("Procedure", searchParameters = procParams);
        procBundle = <json>procResp.'resource;
    } on fail error e {
        log:printWarn("Failed to fetch Procedures: " + e.message());
    }

    ClinicalMedication[] medications = extractMedications(medBundle);
    ClinicalObservation[] observations = extractObservations(obsBundle);
    ClinicalProcedure[] procedures = extractProcedures(procBundle);

    string[] lines = [];
    lines.push("=== PATIENT CLINICAL SUMMARY ===");
    lines.push("");
    lines.push("## Medications (" + medications.length().toString() + ")");
    foreach ClinicalMedication m in medications {
        string dates = "";
        if m.startDate is string {
            dates = " | start: " + <string>m.startDate;
        }
        if m.endDate is string {
            dates += " end: " + <string>m.endDate;
        }
        string reason = m.reason is string ? " | reason: " + <string>m.reason : "";
        lines.push(string `  - [${m.id}] ${m.name} (status: ${m.status}${dates}${reason})`);
    }

    lines.push("");
    lines.push("## Procedures (" + procedures.length().toString() + ")");
    foreach ClinicalProcedure p in procedures {
        string date = p.date is string ? " | date: " + <string>p.date : "";
        string outcome = p.outcome is string ? " | outcome: " + <string>p.outcome : "";
        lines.push(string `  - [${p.id}] ${p.code} ${p.display}${date}${outcome}`);
    }

    lines.push("");
    lines.push("## Observations (" + observations.length().toString() + ")");
    foreach ClinicalObservation o in observations {
        string unitStr = o.unit is string ? " " + <string>o.unit : "";
        string date = o.date is string ? " | date: " + <string>o.date : "";
        lines.push(string `  - [${o.id}] ${o.code} ${o.display}: ${o.value}${unitStr}${date}`);
    }

    return string:'join("\n", ...lines);
}

isolated function extractMedications(json bundle) returns ClinicalMedication[] {
    ClinicalMedication[] results = [];
    json|error entries = bundle.entry;
    if entries is error {
        return results;
    }
    json[] entryArray = <json[]>entries;
    foreach json entry in entryArray {
        json|error res = entry.'resource;
        if res is error {
            continue;
        }
        international401:MedicationRequest|error medReq = res.cloneWithType();
        if medReq is error {
            continue;
        }

        string id = medReq.id ?: "unknown";

        string name = "";
        r4:CodeableConcept? medConcept = medReq.medicationCodeableConcept;
        if medConcept is r4:CodeableConcept {
            r4:Coding[]? codings = medConcept.coding;
            if codings is r4:Coding[] && codings.length() > 0 {
                name = codings[0].display ?: "";
            }
            if name == "" {
                name = medConcept.text ?: "";
            }
        }

        string status = medReq.status;

        string? startDate = ();
        string? endDate = ();
        international401:MedicationRequestDispenseRequest? dispenseReq = medReq.dispenseRequest;
        if dispenseReq is international401:MedicationRequestDispenseRequest {
            r4:Period? period = dispenseReq.validityPeriod;
            if period is r4:Period {
                startDate = period.'start;
                endDate = period.end;
            }
        }
        if startDate is () {
            startDate = medReq.authoredOn;
        }

        string? reason = ();
        r4:CodeableConcept[]? reasonCodes = medReq.reasonCode;
        if reasonCodes is r4:CodeableConcept[] && reasonCodes.length() > 0 {
            reason = reasonCodes[0].text;
        }

        if name != "" {
            results.push({id, name, status, startDate, endDate, reason});
        }
    }
    return results;
}

isolated function extractObservations(json bundle) returns ClinicalObservation[] {
    ClinicalObservation[] results = [];
    json|error entries = bundle.entry;
    if entries is error {
        return results;
    }
    json[] entryArray = <json[]>entries;
    foreach json entry in entryArray {
        json|error res = entry.'resource;
        if res is error {
            continue;
        }
        international401:Observation|error obs = res.cloneWithType();
        if obs is error {
            continue;
        }

        string id = obs.id ?: "unknown";

        string code = "";
        string display = "";
        r4:CodeableConcept obsCode = obs.code;
        r4:Coding[]? codings = obsCode.coding;
        if codings is r4:Coding[] && codings.length() > 0 {
            code = codings[0].code ?: "";
            display = codings[0].display ?: "";
        }

        string value = "";
        string? unit = ();
        r4:Quantity? vq = obs.valueQuantity;
        if vq is r4:Quantity {
            decimal? vqVal = vq.value;
            value = vqVal is decimal ? vqVal.toString() : "";
            unit = vq.unit;
        } else {
            r4:CodeableConcept? vc = obs.valueCodeableConcept;
            if vc is r4:CodeableConcept {
                value = vc.text ?: "";
            }
        }

        string? date = obs.effectiveDateTime;

        if code != "" || display != "" {
            results.push({id, code, display, value, unit, date});
        }
    }
    return results;
}

isolated function extractProcedures(json bundle) returns ClinicalProcedure[] {
    ClinicalProcedure[] results = [];
    json|error entries = bundle.entry;
    if entries is error {
        return results;
    }
    json[] entryArray = <json[]>entries;
    foreach json entry in entryArray {
        json|error res = entry.'resource;
        if res is error {
            continue;
        }
        international401:Procedure|error proc = res.cloneWithType();
        if proc is error {
            continue;
        }

        string id = proc.id ?: "unknown";

        string code = "";
        string display = "";
        r4:CodeableConcept? procCode = proc.code;
        if procCode is r4:CodeableConcept {
            r4:Coding[]? codings = procCode.coding;
            if codings is r4:Coding[] && codings.length() > 0 {
                code = codings[0].code ?: "";
                display = codings[0].display ?: "";
            }
        }

        string? date = proc.performedDateTime;
        if date is () {
            r4:Period? perfPeriod = proc.performedPeriod;
            if perfPeriod is r4:Period {
                date = perfPeriod.'start;
            }
        }

        string? outcome = ();
        r4:CodeableConcept? outcomeCC = proc.outcome;
        if outcomeCC is r4:CodeableConcept {
            outcome = outcomeCC.text;
        }

        if code != "" || display != "" {
            results.push({id, code, display, date, outcome});
        }
    }
    return results;
}
