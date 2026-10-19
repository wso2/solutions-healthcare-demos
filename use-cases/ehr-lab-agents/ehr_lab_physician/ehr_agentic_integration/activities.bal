import ballerina/workflow;
import ballerinax/health.fhir.r4.international401;

// Workflow activities: every step with a side effect. Temporal records each result, so a completed
// activity is never re-run on replay; a failed one is retried per the workflow's retry policy.
// Each activity also projects its outcome into the read model and the integration timeline.
//
// Two rules every activity here follows:
//  - Record arguments are re-typed with `cloneWithType()` first. ballerina/workflow 1.0.1 delivers
//    them with nested arrays typed `anydata[]` (not `string[]`), and storing one into a typed field
//    fails with an InherentTypeViolation.
//  - Writes to an EHR and the lab are idempotent (create-once on a business identifier), because a
//    retried activity runs again from the top.

@workflow:Activity
isolated function buildPatientSummary(string assessmentId, string ehr, string patientId) returns PatientSummary|error {
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
    PatientSummary summary = buildSummary(system, ehrRecord);
    check putData(assessmentId, "summary", summary.toJson());
    addEvent(assessmentId, WORKFLOW, "Patient summary ready",
            string `${summary.biomarkers.length()} biomarkers, ${summary.flags.length()} flags, ${summary.careGaps.length()} care gaps`);
    return summary;
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
            "In-progress ambulatory visit — longevity risk assessment");
    addEvent(assessmentId, WORKFLOW, "Waiting on the physician", "Human task: evaluate the record and order labs");
    return encounterId;
}

@workflow:Activity
isolated function placeLabOrder(string assessmentId, string ehr, string patientId, string encounterId,
        string practitionerId, LabOrderApproval approval) returns LabOrderPlaced|error {
    LabOrderApproval approvedOrder = check approval.cloneWithType();
    EhrSystemConfig system = check ehrSystem(ehr);
    check setStage(assessmentId, PLACING_LAB_ORDER);
    string placerOrderId = string `${assessmentId}-01`;
    international401:Patient ehrPatient = check readEhrPatient(ehr, patientId);
    string practitionerName = check practitionerDisplay(ehr, practitionerId);

    string ehrServiceRequestId = check createEhrServiceRequest(ehr, patientId, encounterId, practitionerId,
            placerOrderId, approvedOrder.approvedTests, approvedOrder.note);
    addEvent(assessmentId, EHR, string `${system.displayName}: ServiceRequest/${ehrServiceRequestId} (order of record)`,
            string `Placer order ${placerOrderId}`);

    string labPatientId = check ensureLabPatient(ehrPatient, system.mrnSystem);
    addEvent(assessmentId, LAB, string `${labDisplayName}: patient matched by MRN → Patient/${labPatientId}`);

    string labServiceRequestId = check submitLabOrder(labPatientId, placerOrderId, approvedOrder.approvedTests,
            practitionerName, approvedOrder.note);
    check setLabOrder(assessmentId, labServiceRequestId);

    LabOrderPlaced labOrder = {
        labPatientId, labServiceRequestId, ehrServiceRequestId, placerOrderId, tests: approvedOrder.approvedTests
    };
    check putData(assessmentId, "labOrder", labOrder.toJson());
    addEvent(assessmentId, LAB, string `${labDisplayName}: order received — ServiceRequest/${labServiceRequestId}`,
            string:'join(", ", ...approvedOrder.approvedTests));
    return labOrder;
}

@workflow:Activity
isolated function notifyPatient(string assessmentId, string ehr, string patientId, string encounterId,
        string practitionerId, LabOrderPlaced labOrder) returns PatientNotification|error {
    LabOrderPlaced placedOrder = check labOrder.cloneWithType();
    string practitionerName = check practitionerDisplay(ehr, practitionerId);
    string[] instructions = preparationFor(placedOrder.tests);
    string[] testNames = from string code in placedOrder.tests
        let OrderableTest? test = orderableByCode(code)
        select test is OrderableTest ? test.name : code;
    string message = string `${practitionerName} has ordered blood tests for you: ${string:'join(", ", ...testNames)}. `
        + string `Please visit any ${labDisplayName} patient service center. ${string:'join(" ", ...instructions)} `
        + string `Order number ${placedOrder.placerOrderId}.`;
    string communicationId = check createEhrCommunication(assessmentId, ehr, patientId, encounterId,
            placedOrder.ehrServiceRequestId, practitionerId, message);
    PatientNotification notification = {communicationId, message, instructions, labName: labDisplayName};
    check putData(assessmentId, "patientNotification", notification.toJson(), AWAITING_PATIENT);
    addEvent(assessmentId, EHR, string `${ehrName(ehr)}: patient notified — Communication/${communicationId}`,
            string:'join(" ", ...instructions));
    addEvent(assessmentId, WORKFLOW, "Waiting on the patient", string `Human task: visit ${labDisplayName} for the blood draw`);
    return notification;
}

@workflow:Activity
isolated function recordLabVisit(string assessmentId, LabVisit visit) returns error? {
    LabVisit labVisit = check visit.cloneWithType();
    check putData(assessmentId, "labVisit", labVisit.toJson(), AWAITING_LAB);
    addEvent(assessmentId, PATIENT, string `Patient visited ${labDisplayName}`,
            string `Specimen/${labVisit.specimenId} collected ${labVisit.collectedAt.substring(0, 16).trim()}`);
    addEvent(assessmentId, WORKFLOW, "Waiting on the lab", "System event: the lab's report-ready notification");
}

@workflow:Activity
isolated function collectLabResults(string assessmentId, string ehr, string patientId, string encounterId,
        LabOrderPlaced labOrder, LabResultNotice notice) returns LabResults|error {
    LabOrderPlaced placedOrder = check labOrder.cloneWithType();
    LabResultNotice readyNotice = check notice.cloneWithType();
    check setStage(assessmentId, ANALYZING_RESULTS);
    addEvent(assessmentId, LAB, string `${labDisplayName}: lab report ready (via ${readyNotice.via})`,
            string `DiagnosticReport/${readyNotice.diagnosticReportId} — ${readyNotice.status}`);

    [json, json[]] [report, observations] = check readLabReport(readyNotice.diagnosticReportId);
    LabResultValue[] values = check labResultValues(observations);
    addEvent(assessmentId, LAB, string `${labDisplayName}: ${values.length()} results retrieved`);

    string ehrReportId = check fileLabResultsInEhr(ehr, patientId, encounterId, placedOrder.ehrServiceRequestId,
            report, observations);
    addEvent(assessmentId, EHR, string `${ehrName(ehr)}: results filed as DiagnosticReport/${ehrReportId}`,
            string `${observations.length()} Observations + report, one transaction`);

    json|error issued = report.issued;
    LabResults results = {
        diagnosticReportId: readyNotice.diagnosticReportId,
        ehrDiagnosticReportId: ehrReportId,
        status: readyNotice.status,
        issued: issued is string ? issued : nowIso(),
        results: values
    };
    check putData(assessmentId, "labResults", results.toJson());
    return results;
}

@workflow:Activity
isolated function analyseResults(string assessmentId, PatientSummary summary, LabOrderApproval approval,
        LabResults results) returns ResultsAnalysis|error {
    PatientSummary patientSummary = check summary.cloneWithType();
    LabOrderApproval approvedOrder = check approval.cloneWithType();
    LabResults labResults = check results.cloneWithType();
    CopilotEvaluation? evaluation = check latestEvaluation(assessmentId);
    addEvent(assessmentId, AGENT, "Results Analysis: comparing results with EHR history");
    ResultsAnalysis|error analysis = runResultsAnalysisAgent(assessmentId, patientSummary, approvedOrder, evaluation, labResults);
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
isolated function writeCarePlan(string assessmentId, PatientSummary summary, LabOrderApproval approval,
        ResultsAnalysis analysis) returns CarePlanResult|error {
    PatientSummary patientSummary = check summary.cloneWithType();
    LabOrderApproval approvedOrder = check approval.cloneWithType();
    ResultsAnalysis resultsAnalysis = check analysis.cloneWithType();
    addEvent(assessmentId, AGENT, "Care Plan: drafting note and patient report");
    CarePlanResult|error plan = runCarePlanAgent(assessmentId, patientSummary, approvedOrder, resultsAnalysis);
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
isolated function publishLongevityRecord(string assessmentId, PatientSummary summary, LabResults results,
        ResultsAnalysis analysis, CarePlanResult plan, PhysicianRelease release, string noteId) returns error? {
    PatientSummary patientSummary = check summary.cloneWithType();
    LabResults labResults = check results.cloneWithType();
    ResultsAnalysis resultsAnalysis = check analysis.cloneWithType();
    CarePlanResult carePlan = check plan.cloneWithType();
    PhysicianRelease physicianRelease = check release.cloneWithType();
    AssessmentRow? row = check getAssessment(assessmentId);
    string practitionerId = row is AssessmentRow ? row.practitionerId : defaultPractitionerId;
    json longevityRecord = buildLongevityRecord(assessmentId, patientSummary, labResults, resultsAnalysis, carePlan,
            physicianRelease, practitionerId, noteId);
    check upsertLongevityRecord(patientSummary.patient.ehr, patientSummary.patient.id, assessmentId, longevityRecord);
    check putData(assessmentId, "longevityRecord", {published: true, patientId: patientSummary.patient.id}, COMPLETED);
    addEvent(assessmentId, WORKFLOW, "Longevity record published",
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
