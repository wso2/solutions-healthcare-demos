import ballerina/lang.array;
import ballerina/lang.'string as strings;
import ballerina/time;
import ballerinax/health.clients.fhir;

// The EHR data explorer: the physician picks data types and a date range, the integration runs one
// FHIR search per type against the chosen EHR (in parallel, filtered by the EHR itself), and every
// resource comes back as one normalised row. The physician then hands a selection to the Copilot.

# The data types the explorer can fetch, each with the FHIR search that fetches it.
#
# + kind - the explorer's name for it
# + label - shown in the portal
# + resourceType - the FHIR resource searched
# + params - fixed search parameters
# + dateParam - the search parameter that filters by date, or nil when the type is not filtered by date
# + activeParam - for types with a current state (problems, medications): the status parameter of a second
# search that brings in active entries older than the date range
type ExplorerKind record {|
    string kind;
    string label;
    string resourceType;
    map<string> params = {};
    string? dateParam;
    [string, string]? activeParam = ();
|};

# Every data type the explorer offers. `Condition` filters on `recorded-date`: wso2/fhir-server 2.1.0
# never matches `onset-date` (see ISSUES_TO_REPORT.md).
final readonly & ExplorerKind[] EXPLORER_KINDS = [
    {kind: "encounter", label: "Encounters", resourceType: "Encounter", params: {"_sort": "-date"}, dateParam: "date"},
    {kind: "problem", label: "Problems", resourceType: "Condition", dateParam: "recorded-date",
        activeParam: ["clinical-status", "active"]},
    {kind: "medication", label: "Prescriptions", resourceType: "MedicationRequest", dateParam: "authoredon",
        activeParam: ["status", "active"]},
    {kind: "medication-reported", label: "Reported medications", resourceType: "MedicationStatement",
        dateParam: "effective", activeParam: ["status", "active"]},
    {kind: "lab", label: "Lab results", resourceType: "Observation", params: {"category": "laboratory"}, dateParam: "date"},
    {kind: "report", label: "Lab reports", resourceType: "DiagnosticReport", params: {"category": "LAB"}, dateParam: "date"},
    {kind: "vital", label: "Vital signs", resourceType: "Observation", params: {"category": "vital-signs"}, dateParam: "date"},
    {kind: "allergy", label: "Allergies", resourceType: "AllergyIntolerance", dateParam: ()},
    {kind: "immunization", label: "Immunizations", resourceType: "Immunization", dateParam: "date"},
    {kind: "procedure", label: "Procedures", resourceType: "Procedure", dateParam: "date"},
    {kind: "note", label: "Clinical notes", resourceType: "DocumentReference", dateParam: "date"},
    {kind: "social", label: "Social history", resourceType: "Observation", params: {"category": "social-history"}, dateParam: "date"}
];

# Fetches the patient's records of the given kinds from the EHR.
#
# + ehr - the EHR id
# + patientId - the patient's id in that EHR
# + kinds - which data types to fetch; empty fetches all of them
# + dateFrom - earliest date (YYYY-MM-DD), or nil for no lower bound
# + dateTo - latest date (YYYY-MM-DD), or nil for no upper bound
# + return - the rows, newest first, with the FHIR searches that produced them, or an error if any search fails
isolated function exploreEhrRecords(string ehr, string patientId, string[] kinds, string? dateFrom, string? dateTo)
        returns ExplorerResult|error {
    fhir:FHIRConnector connector = check ehrClient(ehr);
    ExplorerKind[] selected = from ExplorerKind kind in EXPLORER_KINDS
        where kinds.length() == 0 || kinds.indexOf(kind.kind) is int
        select kind;
    decimal started = time:monotonicNow();

    map<future<json[]|error>> searches = {};
    string[] queries = [];
    foreach ExplorerKind kind in selected {
        map<string[]> params = {"patient": [string `Patient/${patientId}`]};
        foreach [string, string] [name, value] in kind.params.entries() {
            params[name] = [value];
        }
        string? dateParam = kind.dateParam;
        boolean dated = false;
        if dateParam is string {
            string[] bounds = [];
            if dateFrom is string && dateFrom.length() > 0 {
                bounds.push("ge" + dateFrom);
            }
            if dateTo is string && dateTo.length() > 0 {
                bounds.push("le" + dateTo);
            }
            if bounds.length() > 0 {
                params[dateParam] = bounds;
                dated = true;
            }
        }
        queries.push(string `GET ${kind.resourceType}?${queryString(params)}`);
        future<json[]|error> search = start searchResources(connector, kind.resourceType, params.cloneReadOnly());
        searches[kind.kind] = search;

        [string, string]? activeParam = kind.activeParam;
        if dated && activeParam is [string, string] {
            map<string[]> activeParams = {"patient": [string `Patient/${patientId}`], [activeParam[0]]: [activeParam[1]]};
            queries.push(string `GET ${kind.resourceType}?${queryString(activeParams)}`);
            future<json[]|error> activeSearch = start searchResources(connector, kind.resourceType, activeParams.cloneReadOnly());
            searches[kind.kind + ":active"] = activeSearch;
        }
    }

    ExplorerRow[] rows = [];
    map<int> counts = {};
    error? firstFailure = ();
    foreach ExplorerKind kind in selected {
        string[] seen = [];
        int count = 0;
        foreach string key in [kind.kind, kind.kind + ":active"] {
            future<json[]|error>? search = searches[key];
            if search is () {
                continue;
            }
            json[]|error found = wait search;
            if found is error {
                firstFailure = firstFailure ?: found;
                continue;
            }
            foreach json resourceJson in found {
                ExplorerRow row = explorerRow(kind.kind, resourceJson);
                if seen.indexOf(row.ref) is () {
                    seen.push(row.ref);
                    rows.push(row);
                    count += 1;
                }
            }
        }
        counts[kind.kind] = count;
    }
    if firstFailure is error {
        return firstFailure;
    }
    ExplorerRow[] newestFirst = from ExplorerRow row in rows
        order by row.date ?: "" descending
        select row;
    return {
        ehr, patientId, rows: newestFirst, counts, queries,
        fetchedAt: nowIso(),
        durationMs: <int>((time:monotonicNow() - started) * 1000)
    };
}

isolated function queryString(map<string[]> params) returns string {
    string[] parts = [];
    foreach [string, string[]] [name, values] in params.entries() {
        foreach string value in values {
            parts.push(string `${name}=${value}`);
        }
    }
    return string:'join("&", ...parts);
}

# One resource as an explorer row.
#
# + kind - the explorer data type it was fetched as
# + r - the resource as json
# + return - the row
isolated function explorerRow(string kind, json r) returns ExplorerRow {
    string resourceType = jsonText(r, "resourceType") ?: "Resource";
    string ref = string `${resourceType}/${jsonText(r, "id") ?: ""}`;
    match resourceType {
        "Encounter" => {
            return {
                ref, kind, date: jsonText(r, "period", "start"),
                title: stripSemanticTag(conceptLabel(firstOf(r, "type")) ?: "Visit"),
                detail: joinPresent([conceptLabel(firstOf(r, "reasonCode")), jsonText(r, "serviceProvider", "display"),
                    jsonText(r, "participant", 0, "individual", "display")]),
                status: jsonText(r, "status")
            };
        }
        "Condition" => {
            string? abatement = jsonText(r, "abatementDateTime");
            return {
                ref, kind, date: jsonText(r, "onsetDateTime") ?: jsonText(r, "recordedDate"),
                title: stripSemanticTag(conceptLabel(objectAt(r, "code")) ?: "Condition"),
                detail: abatement is string ? string `Resolved ${abatement.substring(0, 10)}` : (),
                status: jsonText(r, "clinicalStatus", "coding", 0, "code"),
                code: jsonText(r, "code", "coding", 0, "code")
            };
        }
        "MedicationRequest" => {
            return {
                ref, kind, date: jsonText(r, "authoredOn"),
                title: conceptLabel(objectAt(r, "medicationCodeableConcept")) ?: "Medication",
                detail: joinPresent([jsonText(r, "dosageInstruction", 0, "text"), jsonText(r, "requester", "display")]),
                status: jsonText(r, "status"),
                code: jsonText(r, "medicationCodeableConcept", "coding", 0, "code")
            };
        }
        "MedicationStatement" => {
            return {
                ref, kind, date: jsonText(r, "effectivePeriod", "start") ?: jsonText(r, "effectiveDateTime"),
                title: conceptLabel(objectAt(r, "medicationCodeableConcept")) ?: "Medication",
                detail: joinPresent(["Patient reported", jsonText(r, "dosage", 0, "text")]),
                status: jsonText(r, "status"),
                code: jsonText(r, "medicationCodeableConcept", "coding", 0, "code")
            };
        }
        "Observation" => {
            return observationRow(ref, kind, r);
        }
        "DiagnosticReport" => {
            return {
                ref, kind, date: jsonText(r, "effectiveDateTime") ?: jsonText(r, "issued"),
                title: conceptLabel(objectAt(r, "code")) ?: "Lab report",
                detail: string `${jsonArray(r, "result").length()} results`,
                status: jsonText(r, "status"),
                code: jsonText(r, "code", "coding", 0, "code")
            };
        }
        "AllergyIntolerance" => {
            string[] reactions = [];
            foreach json reaction in jsonArray(r, "reaction") {
                foreach json manifestation in jsonArray(reaction, "manifestation") {
                    string? label = conceptLabel(manifestation);
                    if label is string {
                        reactions.push(stripSemanticTag(label));
                    }
                }
            }
            return {
                ref, kind, date: jsonText(r, "recordedDate"),
                title: stripSemanticTag(conceptLabel(objectAt(r, "code")) ?: "Allergy"),
                detail: joinPresent([jsonText(r, "category", 0), reactions.length() > 0 ? string:'join(", ", ...reactions) : ()]),
                flag: jsonText(r, "criticality"),
                status: jsonText(r, "clinicalStatus", "coding", 0, "code"),
                code: jsonText(r, "code", "coding", 0, "code")
            };
        }
        "Immunization" => {
            return {
                ref, kind, date: jsonText(r, "occurrenceDateTime"),
                title: conceptLabel(objectAt(r, "vaccineCode")) ?: "Vaccine",
                status: jsonText(r, "status"),
                code: jsonText(r, "vaccineCode", "coding", 0, "code")
            };
        }
        "Procedure" => {
            return {
                ref, kind, date: jsonText(r, "performedPeriod", "start") ?: jsonText(r, "performedDateTime"),
                title: stripSemanticTag(conceptLabel(objectAt(r, "code")) ?: "Procedure"),
                detail: conceptLabel(firstOf(r, "reasonCode")),
                status: jsonText(r, "status"),
                code: jsonText(r, "code", "coding", 0, "code")
            };
        }
        "DocumentReference" => {
            string? text = noteText(r);
            return {
                ref, kind, date: jsonText(r, "date"),
                title: jsonText(r, "description") ?: conceptLabel(objectAt(r, "type")) ?: "Clinical note",
                detail: text is string ? excerpt(text, 180) : (),
                status: jsonText(r, "docStatus") ?: jsonText(r, "status"),
                text
            };
        }
    }
    return {ref, kind, date: (), title: resourceType};
}

isolated function observationRow(string ref, string kind, json r) returns ExplorerRow {
    // LOINC long names carry the property in brackets ("Sodium [Moles/volume] in Blood"); drop it for reading.
    string title = re `\s*\[[^\]]*\]`.replaceAll(conceptLabel(objectAt(r, "code")) ?: "Observation", "");
    string? date = jsonText(r, "effectiveDateTime");
    string? flag = jsonText(r, "interpretation", 0, "coding", 0, "code");
    string? code = jsonText(r, "code", "coding", 0, "code");
    json[] components = jsonArray(r, "component");
    if code == LOINC_BP_PANEL && components.length() > 0 {
        string? systolic = ();
        string? diastolic = ();
        foreach json component in components {
            string? componentCode = jsonText(component, "code", "coding", 0, "code");
            if componentCode == LOINC_SYSTOLIC {
                systolic = jsonText(component, "valueQuantity", "value");
            } else if componentCode == LOINC_DIASTOLIC {
                diastolic = jsonText(component, "valueQuantity", "value");
            }
        }
        return {ref, kind, date, title: "Blood pressure", value: string `${systolic ?: "?"}/${diastolic ?: "?"}`,
            unit: "mmHg", status: jsonText(r, "status"), code};
    }
    string? value = jsonText(r, "valueQuantity", "value");
    string? unit = jsonText(r, "valueQuantity", "unit");
    if value is () {
        string? coded = conceptLabel(objectAt(r, "valueCodeableConcept"));
        value = coded is string ? stripSemanticTag(coded) : jsonText(r, "valueString");
    }
    string? low = jsonText(r, "referenceRange", 0, "low", "value");
    string? high = jsonText(r, "referenceRange", 0, "high", "value");
    string? range = low is string && high is string ? string `ref ${low}–${high}`
        : high is string ? string `ref < ${high}` : low is string ? string `ref > ${low}` : ();
    return {ref, kind, date, title: title.length() > 60 ? excerpt(title, 60) : title, value, unit, flag,
        detail: range, status: jsonText(r, "status"), code};
}

isolated function objectAt(json r, string 'field) returns json => r is map<json> ? r['field] : ();

isolated function firstOf(json r, string 'field) returns json {
    json[] items = jsonArray(r, 'field);
    return items.length() > 0 ? items[0] : ();
}

isolated function joinPresent((string?)[] parts) returns string? {
    string[] present = from string? part in parts
        where part is string && part.length() > 0
        select <string>part;
    return present.length() > 0 ? string:'join(" · ", ...present) : ();
}

isolated function excerpt(string text, int maxLength) returns string {
    string flat = re `\s+`.replaceAll(text, " ").trim();
    return flat.length() > maxLength ? flat.substring(0, maxLength - 1) + "…" : flat;
}

# The text of a clinical note: its first attachment, when it is inline text.
#
# + documentReference - the DocumentReference as json
# + return - the decoded note, or nil when it has no inline text
isolated function noteText(json documentReference) returns string? {
    string? data = jsonText(documentReference, "content", 0, "attachment", "data");
    string contentType = jsonText(documentReference, "content", 0, "attachment", "contentType") ?: "text/plain";
    if data is () || !contentType.startsWith("text/") {
        return ();
    }
    byte[]|error bytes = array:fromBase64(data);
    if bytes is error {
        return ();
    }
    string|error text = strings:fromBytes(bytes);
    return text is string ? text : ();
}
