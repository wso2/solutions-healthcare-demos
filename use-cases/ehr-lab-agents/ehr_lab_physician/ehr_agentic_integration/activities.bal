import ballerina/workflow;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// Workflow activities: every step with a side effect. Temporal records each result, so a completed
// activity is never re-run on replay; a failed one is retried per the workflow's retry policy.
// Each activity also projects its outcome into the read model and the integration timeline.
//
// Two rules every activity here follows:
//  - Clinical data arrives as FHIR JSON and is parsed with the FHIR library's parser (clinical_digest.bal);
//    what an activity stores or returns is serialised with the library's serializers.
//  - Record arguments are re-typed with `cloneWithType()` first. ballerina/workflow 1.0.1 delivers
//    them with nested arrays typed `anydata[]` (not `string[]`), and storing one into a typed field
//    fails with an InherentTypeViolation.
//  - Writes to an EHR and the lab are idempotent (create-once on a business identifier), because a
//    retried activity runs again from the top.

@workflow:Activity
isolated function buildPatientSummary(string assessmentId, string ehr, string patientId) returns json|error {
    check setStage(assessmentId, BUILDING_SUMMARY);
    EhrSystemConfig system = check ehrSystem(ehr);
    EhrRecord|error ehrRecord = fetchEhrRecord(ehr, patientId);
    if ehrRecord is error {
        addEvent(assessmentId, EHR, string `${system.displayName}: patient record fetch failed`, describeError(ehrRecord), "error");
        return ehrRecord;
    }
    addEvent(assessmentId, EHR, ehrRecord.'source == "summary-operation"
            ? string `${system.displayName}: Patient/$summary`
            : string `${system.displayName}: patient record (${ehrRecord.queries.length()} FHIR queries in parallel)`,
            string `${ehrRecord.conditions.length()} conditions, ${ehrRecord.allergies.length()} allergies, `
            + string `${ehrRecord.medicationRequests.length() + ehrRecord.medicationStatements.length()} medications, `
            + string `${ehrRecord.encounters.length()} encounters, ${ehrRecord.observations.length()} observations`);
    r4:Bundle summary = buildSummary(system, ehrRecord);
    json summaryJson = check fhirJson(summary);
    check putData(assessmentId, "summary", summaryJson);
    IpsContents contents = check ipsContents(summaryJson);
    addEvent(assessmentId, WORKFLOW, "Patient summary ready (IPS document)",
            string `${contents.biomarkers.length()} biomarkers, ${contents.flags.length()} flags, ${contents.careGaps.length()} care gaps`);
    return summaryJson;
}

@workflow:Activity
isolated function openEhrEncounter(string assessmentId, string ehr, string patientId, string practitionerId)
        returns string|error {
    string|error encounterId = createEhrEncounter(assessmentId, ehr, patientId, practitionerId);
    if encounterId is error {
        addEvent(assessmentId, EHR, string `${ehrName(ehr)}: create Encounter failed`, describeError(encounterId), "error");
        return encounterId;
    }
    check setEncounter(assessmentId, encounterId);
    check setStage(assessmentId, AWAITING_PHYSICIAN);
    addEvent(assessmentId, EHR, string `${ehrName(ehr)}: Encounter/${encounterId} opened`,
            "In-progress ambulatory visit — preventive health risk assessment");
    addEvent(assessmentId, WORKFLOW, "Waiting on the physician", "Human task: evaluate the record and order labs");
    return encounterId;
}

@workflow:Activity
isolated function placeLabOrder(string assessmentId, string ehr, string patientId, string encounterId,
        string practitionerId, LabOrderApproval approval) returns json|error {
    LabOrderApproval approvedOrder = check approval.cloneWithType();
    EhrSystemConfig system = check ehrSystem(ehr);
    check setStage(assessmentId, PLACING_LAB_ORDER);
    string placerOrderId = string `${assessmentId}-01`;
    international401:Patient ehrPatient = check readEhrPatient(ehr, patientId);
    string practitionerName = check practitionerDisplay(ehr, practitionerId);

    international401:ServiceRequest ehrOrder = check createEhrServiceRequest(ehr, patientId, encounterId, practitionerId,
            placerOrderId, approvedOrder.approvedTests, approvedOrder.note);
    addEvent(assessmentId, EHR, string `${system.displayName}: ServiceRequest/${ehrOrder.id ?: ""} (order of record)`,
            string `Placer order ${placerOrderId}`);

    string labPatientId = check ensureLabPatient(ehrPatient, system.mrnSystem);
    addEvent(assessmentId, LAB, string `${labDisplayName}: patient matched by MRN → Patient/${labPatientId}`);

    international401:ServiceRequest labOrder = check submitLabOrder(labPatientId, placerOrderId,
            approvedOrder.approvedTests, practitionerName, approvedOrder.note);
    string labServiceRequestId = labOrder.id ?: "";
    check setLabOrder(assessmentId, labServiceRequestId);

    // The order as both systems hold it: the EHR's order of record, then the lab's copy.
    r4:Bundle placed = {
        'type: "collection",
        timestamp: nowIso(),
        entry: [
            {fullUrl: string `${system.fhirBaseUrl}/ServiceRequest/${ehrOrder.id ?: ""}`, 'resource: ehrOrder},
            {fullUrl: string `${labFhirBaseUrl}/ServiceRequest/${labServiceRequestId}`, 'resource: labOrder}
        ]
    };
    json placedJson = check fhirJson(placed);
    check putData(assessmentId, "labOrder", placedJson);
    addEvent(assessmentId, LAB, string `${labDisplayName}: order received — ServiceRequest/${labServiceRequestId}`,
            string:'join(", ", ...approvedOrder.approvedTests));
    return placedJson;
}

@workflow:Activity
isolated function notifyPatient(string assessmentId, string ehr, string patientId, string encounterId,
        string practitionerId, json labOrder) returns json|error {
    [international401:ServiceRequest, international401:ServiceRequest] [ehrOrder, _] = check labOrderContents(labOrder);
    string[] tests = orderedTestCodes(ehrOrder);
    string practitionerName = check practitionerDisplay(ehr, practitionerId);
    string[] instructions = preparationFor(tests);
    string[] testNames = from string code in tests
        let OrderableTest? test = orderableByCode(code)
        select test is OrderableTest ? test.name : code;
    string message = string `${practitionerName} has ordered blood tests for you: ${string:'join(", ", ...testNames)}. `
        + string `Please visit any ${labDisplayName} patient service center. ${string:'join(" ", ...instructions)} `
        + string `Order number ${identifierValue(ehrOrder.identifier, PLACER_ORDER_SYSTEM) ?: ""}.`;
    international401:Communication communication = check createEhrCommunication(assessmentId, ehr, patientId,
            encounterId, ehrOrder.id ?: "", practitionerId, message, instructions);
    json communicationJson = check fhirJson(communication);
    check putData(assessmentId, "patientNotification", communicationJson, AWAITING_PATIENT);
    addEvent(assessmentId, EHR, string `${ehrName(ehr)}: patient notified — Communication/${communication.id ?: ""}`,
            string:'join(" ", ...instructions));
    addEvent(assessmentId, WORKFLOW, "Waiting on the patient", string `Human task: visit ${labDisplayName} for the blood draw`);
    return communicationJson;
}

@workflow:Activity
isolated function recordLabVisit(string assessmentId, json visit) returns error? {
    international401:Specimen specimen = check (check parseFhir(visit)).ensureType();
    check putData(assessmentId, "labVisit", check fhirJson(specimen), AWAITING_LAB);
    string collectedAt = specimen.collection?.collectedDateTime ?: "";
    addEvent(assessmentId, PATIENT, string `Patient visited ${labDisplayName}`,
            string `Specimen/${specimen.id ?: ""} collected ${collectedAt.length() >= 16 ? collectedAt.substring(0, 16) : collectedAt}`);
    addEvent(assessmentId, WORKFLOW, "Waiting on the lab", "System event: the lab's report-ready notification");
}

@workflow:Activity
isolated function collectLabResults(string assessmentId, string ehr, string patientId, string encounterId,
        json labOrder, json notice) returns json|error {
    [international401:ServiceRequest, international401:ServiceRequest] [ehrOrder, _] = check labOrderContents(labOrder);
    check setStage(assessmentId, ANALYZING_RESULTS);

    // The lab's own FHIR resources, as its message carried them (or the fallback poller read them).
    r4:Bundle readyNotice = check (check parseFhir(notice)).ensureType();
    r4:Coding[] tags = readyNotice.meta?.tag ?: [];
    string via = tags.length() > 0 ? tags[0].display ?: "lab" : "lab";
    [international401:DiagnosticReport, international401:Observation[]] [report, observations] = check labResultsContents(notice);
    addEvent(assessmentId, LAB, string `${labDisplayName}: lab report ready (via ${via})`,
            string `DiagnosticReport/${report.id ?: ""} — ${report.status}`);
    addEvent(assessmentId, LAB, string `${labDisplayName}: ${labResultsDigest(observations).length()} results received`,
            string `DiagnosticReport + ${observations.length()} Observations (FHIR R4)`);

    r4:Bundle filed = check fileLabResultsInEhr(ehr, patientId, encounterId, ehrOrder.id ?: "", report, observations);
    r4:BundleEntry[] filedEntries = filed.entry ?: [];
    anydata filedReport = filedEntries.length() > 0 ? filedEntries[0]?.'resource : ();
    addEvent(assessmentId, EHR, string `${ehrName(ehr)}: results filed as DiagnosticReport/${
            filedReport is international401:DiagnosticReport ? filedReport.id ?: "" : ""}`,
            string `${observations.length()} Observations + report, one transaction`);
    json filedJson = check fhirJson(filed);
    check putData(assessmentId, "labResults", filedJson);
    return filedJson;
}

@workflow:Activity
isolated function analyseResults(string assessmentId, string ehr, json summary, LabOrderApproval approval,
        json results) returns ResultsAnalysis|error {
    IpsContents patientSummary = check ipsContents(summary);
    LabOrderApproval approvedOrder = check approval.cloneWithType();
    [international401:DiagnosticReport, international401:Observation[]] labResults = check labResultsContents(results);
    CopilotEvaluation? evaluation = check latestEvaluation(assessmentId);
    addEvent(assessmentId, AGENT, "Results Analysis: comparing results with EHR history");
    ResultsAnalysis|error analysis = runResultsAnalysisAgent(assessmentId, ehr, patientSummary, approvedOrder,
            evaluation, labResults);
    if analysis is error {
        error failure = compactAgentError("Results Analysis", analysis);
        addEvent(assessmentId, AGENT, "Results Analysis failed", failure.message(), "error");
        return failure;
    }
    check putData(assessmentId, "analysis", analysis.toJson(), GENERATING_CARE_PLAN);
    addEvent(assessmentId, AGENT, string `Results Analysis: ${analysis.riskFlags.length()} risk flags`, analysis.headline);
    return analysis;
}

@workflow:Activity
isolated function writeCarePlan(string assessmentId, string ehr, json summary, LabOrderApproval approval,
        ResultsAnalysis analysis) returns CarePlanResult|error {
    IpsContents patientSummary = check ipsContents(summary);
    LabOrderApproval approvedOrder = check approval.cloneWithType();
    ResultsAnalysis resultsAnalysis = check analysis.cloneWithType();
    addEvent(assessmentId, AGENT, "Care Plan: drafting note and patient report");
    CarePlanResult|error plan = runCarePlanAgent(assessmentId, ehr, patientSummary, approvedOrder, resultsAnalysis);
    if plan is error {
        error failure = compactAgentError("Care Plan", plan);
        addEvent(assessmentId, AGENT, "Care Plan failed", failure.message(), "error");
        return failure;
    }
    check putData(assessmentId, "carePlan", plan.toJson());
    addEvent(assessmentId, AGENT, string `Care Plan: ${plan.goals.length()} goals, ${plan.followUpLabs.length()} follow-up tests`);
    return plan;
}

@workflow:Activity
isolated function fileDraftNote(string assessmentId, string ehr, string patientId, string encounterId,
        string practitionerId, CarePlanResult plan) returns string|error {
    CarePlanResult carePlan = check plan.cloneWithType();
    string noteId = check createEhrDraftNote(assessmentId, ehr, patientId, encounterId, practitionerId, carePlan.physicianNote);
    check putData(assessmentId, "draftNote", {noteId, status: "preliminary"}, AWAITING_REVIEW);
    addEvent(assessmentId, EHR, string `${ehrName(ehr)}: draft note filed — DocumentReference/${noteId} (preliminary)`);
    addEvent(assessmentId, WORKFLOW, "Waiting on the physician", "Human task: review the analysis and release it to the patient");
    return noteId;
}

@workflow:Activity
isolated function finalizeInEhr(string assessmentId, string ehr, string encounterId, string noteId,
        string practitionerId, CarePlanResult plan, PhysicianRelease release) returns error? {
    CarePlanResult carePlan = check plan.cloneWithType();
    PhysicianRelease physicianRelease = check release.cloneWithType();
    string physicianName = check practitionerDisplay(ehr, practitionerId);
    check finalizeEhrNote(ehr, noteId, carePlan.physicianNote, physicianName, physicianRelease.comment);
    addEvent(assessmentId, EHR, string `${ehrName(ehr)}: note signed — DocumentReference/${noteId} (final)`);
    check finishEhrEncounter(ehr, encounterId);
    addEvent(assessmentId, EHR, string `${ehrName(ehr)}: Encounter/${encounterId} finished`);
}

@workflow:Activity
isolated function publishLongevityRecord(string assessmentId, string ehr, json summary, json results,
        ResultsAnalysis analysis, CarePlanResult plan, PhysicianRelease release, string noteId) returns error? {
    IpsContents patientSummary = check ipsContents(summary);
    [international401:DiagnosticReport, international401:Observation[]] labResults = check labResultsContents(results);
    ResultsAnalysis resultsAnalysis = check analysis.cloneWithType();
    CarePlanResult carePlan = check plan.cloneWithType();
    PhysicianRelease physicianRelease = check release.cloneWithType();
    AssessmentRow? row = check getAssessment(assessmentId);
    string practitionerId = row is AssessmentRow ? row.practitionerId : defaultPractitionerId;
    string patientId = patientSummary.patient.id ?: "";
    json longevityRecord = buildLongevityRecord(assessmentId, ehr, patientSummary, labResults, resultsAnalysis,
            carePlan, physicianRelease, practitionerId, noteId);
    check upsertLongevityRecord(ehr, patientId, assessmentId, longevityRecord);
    check putData(assessmentId, "longevityRecord", {published: true, patientId}, COMPLETED);
    addEvent(assessmentId, WORKFLOW, "Health record published",
            "Physician dashboard and patient app now read the updated record");
}

@workflow:Activity
isolated function recordFailure(string assessmentId, string message) returns error? {
    check markFailed(assessmentId, message);
    addEvent(assessmentId, WORKFLOW, "Assessment stopped", message, "error");
}

# The Copilot evaluation the physician was looking at when they ordered, if they asked for one.
#
# + assessmentId - the assessment
# + return - the latest evaluation, nil if there was none, or an error if the read model cannot be read
isolated function latestEvaluation(string assessmentId) returns CopilotEvaluation?|error {
    AssessmentRow? row = check getAssessment(assessmentId);
    if row is () {
        return ();
    }
    json data = check row.data.fromJsonString();
    json|error evaluation = data.evaluation;
    if evaluation is () || evaluation is error {
        return ();
    }
    return evaluation.cloneWithType();
}
