import ballerina/lang.array;
import ballerina/lang.'string as strings;
import ballerina/uuid;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// The EHR data explorer: the physician picks data types and a date range, the integration runs one
// FHIR search per type against the chosen EHR (in parallel, filtered by the EHR itself), and the resources
// come back as FHIR — parsed with the FHIR library, in a `collection` Bundle with a Provenance listing the
// searches. The physician then hands a selection of those resources to the Copilot.

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
# + return - a `collection` Bundle of the resources, parsed with the FHIR library, deduplicated and newest
# first, ending with a Provenance that lists the FHIR searches and when they ran; or an error if any search fails
isolated function exploreEhrRecords(string ehr, string patientId, string[] kinds, string? dateFrom, string? dateTo)
        returns r4:Bundle|error {
    fhir:FHIRConnector connector = check ehrClient(ehr);
    EhrSystemConfig system = check ehrSystem(ehr);
    ExplorerKind[] selected = from ExplorerKind kind in EXPLORER_KINDS
        where kinds.length() == 0 || kinds.indexOf(kind.kind) is int
        select kind;
    string started = nowIso();

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

    [string, anydata][] found = [];
    string[] seen = [];
    error? firstFailure = ();
    foreach ExplorerKind kind in selected {
        foreach string key in [kind.kind, kind.kind + ":active"] {
            future<json[]|error>? search = searches[key];
            if search is () {
                continue;
            }
            json[]|error results = wait search;
            if results is error {
                firstFailure = firstFailure ?: results;
                continue;
            }
            foreach anydata r in parseResources(results) {
                RecordLine line = recordLine(r);
                if seen.indexOf(line.ref) is () {
                    seen.push(line.ref);
                    found.push([line.date ?: "", r]);
                }
            }
        }
    }
    if firstFailure is error {
        return firstFailure;
    }
    r4:BundleEntry[] entries = [];
    foreach [string, anydata] [_, r] in from [string, anydata] item in found order by item[0] descending select item {
        entries.push({fullUrl: system.fhirBaseUrl + "/" + recordLine(r).ref, 'resource: r});
    }
    international401:Provenance provenance = {
        id: uuid:createType4AsString(),
        target: [{reference: string `Patient/${patientId}`}],
        recorded: nowIso(),
        occurredPeriod: {'start: started, end: nowIso()},
        activity: {text: "EHR data explorer"},
        agent: [{who: {display: system.displayName}}],
        entity: from string fhirQuery in queries select {role: "source", what: {display: fhirQuery}}
    };
    entries.push({fullUrl: string `urn:uuid:${provenance.id ?: ""}`, 'resource: provenance});
    return {'type: "collection", timestamp: nowIso(), entry: entries};
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

// ── One resource, in a line (what the Copilot reads of the records the physician selected) ──

# A clinical resource described in one line.
#
# + ref - the resource reference, e.g. `Observation/abc`
# + kind - the explorer data type: encounter, problem, medication, medication-reported, lab, vital, social,
# report, allergy, immunization, procedure or note
# + date - the clinically relevant date
# + title - what it is
# + detail - one line of context (reason, dosage, reactions, reference range)
# + value - numeric or coded result, for labs and vitals
# + unit - unit of `value`
# + flag - the lab's interpretation (H, L, N) or an allergy's criticality
# + status - the resource's status
# + text - the full text of a clinical note
type RecordLine record {|
    string ref;
    string kind;
    string? date = ();
    string title;
    string? detail = ();
    string? value = ();
    string? unit = ();
    string? flag = ();
    string? status = ();
    string? text = ();
|};

# Describes a parsed FHIR resource in one line.
#
# + r - the resource, as parsed by `parseFhir`
# + return - the line
isolated function recordLine(anydata r) returns RecordLine {
    if r is international401:Encounter {
        r4:CodeableConcept[] types = r.'type ?: [];
        r4:CodeableConcept[] reasons = r.reasonCode ?: [];
        international401:EncounterParticipant[] participants = r.participant ?: [];
        return {ref: string `Encounter/${r.id ?: ""}`, kind: "encounter", date: r.period?.'start,
            title: stripSemanticTag(types.length() > 0 ? conceptText(types[0]) ?: "Visit" : "Visit"),
            detail: joinPresent([reasons.length() > 0 ? conceptText(reasons[0]) : (), r.serviceProvider?.display,
                participants.length() > 0 ? participants[0].individual?.display : ()]),
            status: r.status};
    }
    if r is international401:Condition {
        string? abatement = r.abatementDateTime;
        return {ref: string `Condition/${r.id ?: ""}`, kind: "problem", date: r.onsetDateTime ?: r.recordedDate,
            title: stripSemanticTag(conceptText(r.code) ?: "Condition"),
            detail: abatement is string ? string `Resolved ${dateOnly(abatement) ?: abatement}` : (),
            status: conditionStatus(r)};
    }
    if r is international401:MedicationRequest {
        r4:Dosage[] dosage = r.dosageInstruction ?: [];
        return {ref: string `MedicationRequest/${r.id ?: ""}`, kind: "medication", date: r.authoredOn,
            title: medicationDisplay(r), detail: joinPresent([dosage.length() > 0 ? dosage[0].text : (), r.requester?.display]),
            status: r.status};
    }
    if r is international401:MedicationStatement {
        r4:Dosage[] dosage = r.dosage ?: [];
        return {ref: string `MedicationStatement/${r.id ?: ""}`, kind: "medication-reported",
            date: r.effectivePeriod?.'start ?: r.effectiveDateTime, title: medicationDisplay(r),
            detail: joinPresent(["Patient reported", dosage.length() > 0 ? dosage[0].text : ()]), status: r.status};
    }
    if r is international401:Observation {
        return observationLine(r);
    }
    if r is international401:DiagnosticReport {
        return {ref: string `DiagnosticReport/${r.id ?: ""}`, kind: "report", date: r.effectiveDateTime ?: r.issued,
            title: conceptText(r.code) ?: "Lab report", detail: string `${(r.result ?: []).length()} results`, status: r.status};
    }
    if r is international401:AllergyIntolerance {
        string[] reactions = allergyReactions(r);
        international401:AllergyIntoleranceCategory[] categories = r.category ?: [];
        return {ref: string `AllergyIntolerance/${r.id ?: ""}`, kind: "allergy", date: r.recordedDate,
            title: allergySubstance(r),
            detail: joinPresent([categories.length() > 0 ? categories[0] : (), reactions.length() > 0 ? string:'join(", ", ...reactions) : ()]),
            flag: r.criticality, status: codingCodeAny(r.clinicalStatus)};
    }
    if r is international401:Immunization {
        return {ref: string `Immunization/${r.id ?: ""}`, kind: "immunization", date: r.occurrenceDateTime,
            title: conceptText(r.vaccineCode) ?: "Vaccine", status: r.status};
    }
    if r is international401:Procedure {
        r4:CodeableConcept[] reasons = r.reasonCode ?: [];
        return {ref: string `Procedure/${r.id ?: ""}`, kind: "procedure", date: r.performedPeriod?.'start ?: r.performedDateTime,
            title: stripSemanticTag(conceptText(r.code) ?: "Procedure"), detail: reasons.length() > 0 ? conceptText(reasons[0]) : (),
            status: r.status};
    }
    if r is international401:DocumentReference {
        string? text = noteText(r);
        return {ref: string `DocumentReference/${r.id ?: ""}`, kind: "note", date: r.date,
            title: r.description ?: conceptText(r.'type) ?: "Clinical note",
            detail: text is string ? excerpt(text, 180) : (), status: r.docStatus ?: r.status, text};
    }
    string resourceType = r is map<anydata> ? r["resourceType"].toString() : "Resource";
    string id = r is map<anydata> ? r["id"].toString() : "";
    return {ref: string `${resourceType}/${id}`, kind: resourceType.toLowerAscii(), title: resourceType};
}

isolated function observationLine(international401:Observation r) returns RecordLine {
    string ref = string `Observation/${r.id ?: ""}`;
    string kind = hasCategory(r, "laboratory") ? "lab" : hasCategory(r, "vital-signs") ? "vital"
        : hasCategory(r, "social-history") ? "social" : "observation";
    // LOINC long names carry the property in brackets ("Sodium [Moles/volume] in Blood"); drop it for reading.
    string title = re `\s*\[[^\]]*\]`.replaceAll(conceptText(r.code) ?: "Observation", "");
    if codingCode(r.code, LOINC) == LOINC_BP_PANEL && (r.component ?: []).length() > 0 {
        [decimal?, decimal?] [systolic, diastolic] = bloodPressure(r);
        return {ref, kind, date: r.effectiveDateTime, title: "Blood pressure",
            value: string `${systolic is decimal ? formatDecimal(systolic) : "?"}/${diastolic is decimal ? formatDecimal(diastolic) : "?"}`,
            unit: "mmHg", status: r.status};
    }
    decimal? quantity = r.valueQuantity?.value;
    string? value = quantity is decimal ? formatDecimal(quantity) : ();
    if value is () {
        string? coded = conceptText(r.valueCodeableConcept);
        value = coded is string ? stripSemanticTag(coded) : r.valueString;
    }
    international401:ObservationReferenceRange[] ranges = r.referenceRange ?: [];
    decimal? low = ranges.length() > 0 ? ranges[0].low?.value : ();
    decimal? high = ranges.length() > 0 ? ranges[0].high?.value : ();
    string? range = low is decimal && high is decimal ? string `ref ${formatDecimal(low)}–${formatDecimal(high)}`
        : high is decimal ? string `ref < ${formatDecimal(high)}` : low is decimal ? string `ref > ${formatDecimal(low)}` : ();
    return {ref, kind, date: r.effectiveDateTime, title: title.length() > 60 ? excerpt(title, 60) : title, value,
        unit: r.valueQuantity?.unit, flag: interpretationCode(r), detail: range, status: r.status};
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
# + documentReference - the DocumentReference
# + return - the decoded note, or nil when it has no inline text
isolated function noteText(international401:DocumentReference documentReference) returns string? {
    if documentReference.content.length() == 0 {
        return ();
    }
    r4:Attachment attachment = documentReference.content[0].attachment;
    string? data = attachment.data;
    if data is () || !(attachment.contentType ?: "text/plain").startsWith("text/") {
        return ();
    }
    byte[]|error bytes = array:fromBase64(data);
    if bytes is error {
        return ();
    }
    string|error text = strings:fromBytes(bytes);
    return text is string ? text : ();
}
