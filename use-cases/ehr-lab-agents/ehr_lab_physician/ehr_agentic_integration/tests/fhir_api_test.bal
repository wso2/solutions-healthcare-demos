import ballerina/http;
import ballerina/test;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// The FHIR API (fhir_api.bal): lab messages read into typed resources, the response message, the IPS
// document, and the `$process-message` operation as the FHIR service type serves it.

isolated function specimenMessage() returns r4:Bundle => {
    id: "msg-1",
    'type: "message",
    entry: [
        {fullUrl: "urn:uuid:h1", 'resource: <international401:MessageHeader>{
            id: "h1",
            eventCoding: {system: LAB_EVENT_SYSTEM, code: EVENT_SPECIMEN_COLLECTED},
            'source: {name: "Quest Diagnostics", endpoint: "http://lab/fhir/r4"},
            focus: [{reference: "Specimen/s1"}]
        }},
        {fullUrl: "http://lab/fhir/r4/Specimen/s1", 'resource: <international401:Specimen>{id: "s1", status: "available"}},
        {fullUrl: "http://lab/fhir/r4/ServiceRequest/sr1", 'resource: <international401:ServiceRequest>{
            id: "sr1", status: "active", intent: "order", subject: {reference: "Patient/p1"}
        }}
    ]
};

@test:Config
function parsesASpecimenCollectedMessage() returns error? {
    SpecimenCollectedMessage|ResultsReadyMessage parsed = check parseLabMessage(specimenMessage());
    if parsed !is SpecimenCollectedMessage {
        test:assertFail("expected a specimen-collected message");
    }
    test:assertEquals(parsed.serviceRequestId, "sr1");
    test:assertEquals(parsed.specimen.id, "s1");
    test:assertEquals(parsed.header.id, "h1");
}

@test:Config
function parsesAMessageReceivedAsJson() returns error? {
    // What the FHIR service hands over: the Bundle read from the request's json.
    r4:Bundle received = check specimenMessage().toJson().cloneWithType();
    SpecimenCollectedMessage|ResultsReadyMessage parsed = check parseLabMessage(received);
    test:assertTrue(parsed is SpecimenCollectedMessage);
}

@test:Config
function refusesABundleThatIsNotAMessage() {
    r4:Bundle bundle = specimenMessage();
    bundle.'type = "collection";
    test:assertTrue(parseLabMessage(bundle) is error);
}

@test:Config
function refusesAMessageThatDoesNotStartWithItsHeader() {
    r4:Bundle bundle = specimenMessage();
    r4:BundleEntry[] entries = bundle.entry ?: [];
    bundle.entry = [entries[1], entries[0], entries[2]];
    test:assertTrue(parseLabMessage(bundle) is error);
}

@test:Config
function refusesAnUnknownEvent() {
    r4:Bundle bundle = specimenMessage();
    r4:BundleEntry[] entries = bundle.entry ?: [];
    entries[0].'resource = <international401:MessageHeader>{
        eventCoding: {system: LAB_EVENT_SYSTEM, code: "order-cancelled"},
        'source: {endpoint: "http://lab/fhir/r4"}
    };
    test:assertTrue(parseLabMessage(bundle) is error);
}

@test:Config
function answersAMessageWithAResponseMessage() returns error? {
    SpecimenCollectedMessage|ResultsReadyMessage parsed = check parseLabMessage(specimenMessage());
    r4:Bundle response = messageResponse(parsed.header, true);
    test:assertEquals(response.'type, "message");
    international401:MessageHeader header = check (<anydata>(response.entry ?: [])[0]?.'resource).cloneWithType();
    test:assertEquals(header.response?.identifier, "h1");
    test:assertEquals(header.response?.code, "ok");
    test:assertEquals(header.destination, [{name: "Quest Diagnostics", endpoint: "http://lab/fhir/r4"}]);
}

@test:Config
function buildsTheSummaryAsAnIpsDocument() returns error? {
    EhrSystemConfig system = {id: "ehr", displayName: "EHR", vendor: "fhir", fhirBaseUrl: "http://ehr/fhir/r4",
        mcpServerUrl: "http://ehr/mcp/", mrnSystem: "urn:mrn"};
    EhrRecord ehrRecord = {
        patient: {id: "p1", name: [{given: ["Daniel"], family: "Reyes"}]},
        conditions: [{id: "c1", subject: {reference: "Patient/p1"}, code: {text: "Hypertension (disorder)"},
            clinicalStatus: {coding: [{code: "active"}]}}],
        allergies: [],
        medicationRequests: [],
        medicationStatements: [],
        immunizations: [],
        procedures: [],
        familyHistory: [],
        encounters: [],
        observations: [],
        'source: "composed-search",
        queries: ["GET Patient/p1", "GET Condition?patient=Patient/p1"]
    };
    r4:Bundle ips = buildSummary(system, ehrRecord);
    test:assertEquals(ips.'type, "document");
    r4:BundleEntry[] entries = ips.entry ?: [];
    international401:Composition composition = check (check parseFhir((<anydata>entries[0]?.'resource).toJson())).ensureType();
    test:assertEquals(composition.subject?.reference, "Patient/p1");
    international401:CompositionSection[] sections = composition.section ?: [];
    test:assertEquals(sections[0].entry, [{reference: "Condition/c1"}]);
    // Allergies are required by the IPS: an empty section says "nil known".
    test:assertEquals(sections[1].emptyReason?.coding, [{system: LIST_EMPTY_REASON, code: "nilknown", display: "Nil Known"}]);

    // Through FHIR JSON and back, as the workflow and the portal see it.
    IpsContents contents = check ipsContents(check fhirJson(ips));
    test:assertEquals(contents.conditions.length(), 1);
    test:assertEquals(contents.'source, "composed-search");
    test:assertEquals(contents.ehrName, "EHR");
    // No lab history: no flag but the "no flags" one, and every baseline analyte is a care gap.
    test:assertEquals(contents.flags.length(), 1);
    test:assertEquals(contents.flags[0].severity, "low");
    test:assertTrue(contents.careGaps.length() > 0);
    test:assertEquals(contents.careGaps[0].intent, "proposal");
    test:assertEquals(summaryPatientName(check fhirJson(ips)), "Daniel Reyes");
}

@test:Config
function flagsARisingAnalyteAsADetectedIssue() returns error? {
    EhrSystemConfig system = {id: "ehr", displayName: "EHR", vendor: "fhir", fhirBaseUrl: "http://ehr/fhir/r4",
        mcpServerUrl: "http://ehr/mcp/", mrnSystem: "urn:mrn"};
    international401:Observation[] ldl = from [string, decimal] [date, value] in [["2024-01-10", 120d], ["2025-01-10", 131d], ["2026-01-10", 149d]]
        select {id: "ldl-" + date, status: "final", category: [{coding: [{code: "laboratory"}]}],
            code: {coding: [{system: LOINC, code: "13457-7"}]}, subject: {reference: "Patient/p1"},
            effectiveDateTime: date, valueQuantity: {value, unit: "mg/dL"}, referenceRange: [{high: {value: 160}}]};
    EhrRecord ehrRecord = {patient: {id: "p1"}, conditions: [], allergies: [], medicationRequests: [],
        medicationStatements: [], immunizations: [], procedures: [], familyHistory: [], encounters: [],
        observations: ldl, 'source: "composed-search", queries: []};
    IpsContents contents = check ipsContents(check fhirJson(buildSummary(system, ehrRecord)));
    test:assertEquals(contents.labs.length(), 3);
    test:assertEquals(contents.biomarkers[0].trend, "rising");
    international401:DetectedIssue rising = contents.flags[0];
    test:assertEquals(rising.severity, "moderate", "a rising trend inside the range is a watch");
    test:assertEquals(rising.code?.text, "LDL-C rising on 3 consecutive results");
}

// ── $process-message over HTTP, as the lab calls it ──

final http:Client fhirApi = check new ("http://localhost:19090/fhir/r4");

@test:Config
function processMessageRefusesAWrongKey() returns error? {
    http:Response response = check fhirApi->post("/$process-message", specimenMessage().toJson(),
            {"X-Lab-Api-Key": "wrong"}, mediaType = "application/fhir+json");
    test:assertEquals(response.statusCode, 401);
    json outcome = check response.getJsonPayload();
    test:assertEquals(outcome.resourceType, "OperationOutcome");
}

@test:Config
function processMessageRefusesABundleThatIsNotAMessage() returns error? {
    r4:Bundle bundle = specimenMessage();
    bundle.'type = "collection";
    http:Response response = check fhirApi->post("/$process-message", bundle.toJson(),
            {"X-Lab-Api-Key": labWebhookApiKey}, mediaType = "application/fhir+json");
    test:assertEquals(response.statusCode, 400);
    json outcome = check response.getJsonPayload();
    test:assertEquals(outcome.resourceType, "OperationOutcome");
}

@test:Config
function processMessageAcknowledgesAMessageForNoKnownOrder() returns error? {
    // No assessment waits on ServiceRequest/sr1, so nothing moves; the lab still gets its response message.
    http:Response response = check fhirApi->post("/$process-message", specimenMessage().toJson(),
            {"X-Lab-Api-Key": labWebhookApiKey}, mediaType = "application/fhir+json");
    test:assertTrue(response.statusCode < 300, string `status ${response.statusCode}`);
    json body = check response.getJsonPayload();
    test:assertEquals(body.resourceType, "Bundle");
    test:assertEquals(body.'type, "message");
}

// ── What the agents read and what the patient app publishes, from the FHIR records ──

isolated function sampleRecord() returns EhrRecord => {
    patient: {id: "p1", name: [{given: ["Priya"], family: "Nair"}], gender: "female", birthDate: "1979-08-22",
        identifier: [{system: "urn:demo:longview-clinic:mrn", value: "MRN-100587"}]},
    conditions: [{id: "c1", subject: {reference: "Patient/p1"}, code: {text: "Hypothyroidism (disorder)"},
        clinicalStatus: {coding: [{code: "active"}]}}],
    allergies: [{id: "a1", patient: {reference: "Patient/p1"}, code: {text: "Aspirin"}, criticality: "high",
        reaction: [{manifestation: [{text: "Angioedema (disorder)"}], severity: "severe"}]}],
    medicationRequests: [],
    medicationStatements: [{id: "ms1", status: "active", subject: {reference: "Patient/p1"},
        medicationCodeableConcept: {text: "Ibuprofen 200 MG Oral Tablet"}, effectiveDateTime: "2025-01-01"}],
    immunizations: [],
    procedures: [],
    familyHistory: [{id: "f1", status: "completed", patient: {reference: "Patient/p1"}, relationship: {text: "father"},
        condition: [{code: {text: "Myocardial infarction"}, onsetAge: {value: 49}}]}],
    encounters: [],
    observations: from [string, decimal] [date, value] in [["2024-01-10", 22d], ["2025-01-10", 18d], ["2026-01-10", 15d]]
        select {id: "ferr-" + date, status: "final", category: [{coding: [{code: "laboratory"}]}],
            code: {coding: [{system: LOINC, code: "2276-4"}]}, subject: {reference: "Patient/p1"},
            effectiveDateTime: date, valueQuantity: {value, unit: "ng/mL"}, referenceRange: [{low: {value: 16}, high: {value: 232}}]},
    'source: "composed-search",
    queries: ["GET Patient/p1"]
};

@test:Config
function summaryRulesReadTheFhirRecords() returns error? {
    EhrSystemConfig system = {id: "ehr", displayName: "EHR", vendor: "fhir", fhirBaseUrl: "http://ehr/fhir/r4",
        mcpServerUrl: "http://ehr/mcp/", mrnSystem: "urn:demo:longview-clinic:mrn"};
    IpsContents contents = check ipsContents(check fhirJson(buildSummary(system, sampleRecord())));
    string[] titles = from international401:DetectedIssue f in contents.flags select f.code?.text ?: "";
    test:assertTrue(titles.indexOf("NSAID in use despite Aspirin allergy") is int, titles.toString());
    test:assertTrue(titles.indexOf("Premature cardiovascular disease in the family") is int, titles.toString());
    test:assertTrue(titles.indexOf("Ferritin falling on 3 consecutive results") is int, titles.toString());
    test:assertTrue(titles.indexOf("Ferritin low (15 ng/mL)") is (), "a monotonic trend is reported once, as a trend");
}

@test:Config
function promptsAndLongevityRecordAreBuiltFromTheFhirRecords() returns error? {
    EhrSystemConfig system = {id: "ehr", displayName: "EHR", vendor: "fhir", fhirBaseUrl: "http://ehr/fhir/r4",
        mcpServerUrl: "http://ehr/mcp/", mrnSystem: "urn:demo:longview-clinic:mrn"};
    IpsContents contents = check ipsContents(check fhirJson(buildSummary(system, sampleRecord())));

    json context = check contextForPrompt("ehr", contents).fromJsonString();
    test:assertEquals(check context.patient.name, "Priya Nair");
    test:assertEquals(check context.patient.age, ageFrom("1979-08-22"));
    test:assertEquals((<json[]>check context.activeProblems).length(), 1);
    test:assertEquals(check context.allergies, [{substance: "Aspirin", category: (), criticality: "high",
        reactions: ["Angioedema"], severity: "severe", recorded: ()}]);
    test:assertEquals((<json[]>check context.medications)[0].'source, "patient-reported");
    map<json> digest = summaryDigest("ehr", contents);
    test:assertEquals((<json[]>digest["biomarkers"]).length(), 1);

    // The Copilot's selected records: parsed FHIR resources, one line each.
    string lines = compactRecords(parseResources([
        {resourceType: "Observation", id: "o1", status: "final", category: [{coding: [{code: "laboratory"}]}],
            code: {text: "Ferritin [Mass/volume] in Serum or Plasma"}, effectiveDateTime: "2026-01-10",
            valueQuantity: {value: 15, unit: "ng/mL"}, interpretation: [{coding: [{code: "L"}]}],
            referenceRange: [{low: {value: 16}, high: {value: 232}}]},
        {resourceType: "Condition", id: "c1", subject: {reference: "Patient/p1"}, code: {text: "Hypothyroidism (disorder)"},
            clinicalStatus: {coding: [{code: "active"}]}, onsetDateTime: "2021-04-02"}
    ]));
    test:assertEquals(lines, "- [lab] 2026-01-10 — Ferritin in Serum or Plasma: 15 ng/mL (L) · ref 16–232 · final\n"
        + "- [problem] 2021-04-02 — Hypothyroidism · active");

    // Today's results, as filed in the EHR, merged into the published record.
    international401:DiagnosticReport report = {id: "r1", status: "final", code: {text: "Biomarker panel"}, issued: "2026-11-06T00:00:00Z",
        identifier: [{system: LAB_RESULT_ID_SYSTEM, value: "lab-r1"}]};
    international401:Observation today = {id: "o9", status: "final", code: {coding: [{system: LOINC, code: "2276-4"}]},
        effectiveDateTime: "2026-11-06", valueQuantity: {value: 12, unit: "ng/mL"}, interpretation: [{coding: [{code: "L"}]}]};
    ResultsAnalysis analysis = {headline: "h", updatedSummary: "s", riskFlags: [], biomarkerInsights: []};
    CarePlanResult plan = {physicianNote: "n", goals: [], followUpLabs: [],
        patientReport: {headline: "", whatWeFound: "", keyResults: [], yourPlan: [], nextSteps: [], closingNote: ""}};
    json published = buildLongevityRecord("asm-1", "ehr", contents, [report, [today]], analysis, plan, {comment: ""},
            "prac-1", "note-1");
    test:assertEquals(check published.sources.lab.diagnosticReportId, "lab-r1");
    test:assertEquals(check published.sources.ehr.resultsReportId, "r1");
    json[] biomarkers = <json[]>check published.biomarkers;
    test:assertEquals(biomarkers.length(), 1);
    test:assertEquals((<json[]>check biomarkers[0].history).length(), 4, "three from the EHR, today's from the lab");
}
