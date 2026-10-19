import ballerina/workflow;

// One durable workflow per longevity assessment:
//
//   pull the record from the EHR ─▶ open the visit in the EHR
//   ⏸ physician  (human task)   evaluate with the Copilot, order labs
//   ─▶ order of record in the EHR ─▶ order with the lab ─▶ notify the patient
//   ⏸ patient    (human task)   visit the lab — completed when the lab collects the specimen
//   ⏸ lab        (system event) results ready — the lab's webhook, or the fallback poller
//   ─▶ file results in the EHR ─▶ Results Analysis ─▶ Care Plan ─▶ draft note in the EHR
//   ⏸ physician  (human task)   review and release
//   ─▶ final note, visit closed ─▶ Longevity Record published to the patient
//
// The function only sequences steps and waits; every side effect is an activity, so Temporal can
// replay it after a crash without calling an EHR, the lab or the model twice. While it waits —
// minutes for a physician, days for a patient or a lab — it holds no thread and survives restarts.
//
// Waits on people are human tasks (`awaitHumanTask`): each has an audience (physician, patient) and
// an audit trail of who completed it. The lab's "results ready" is a system notification, so it is a
// data event instead.

# EHR and lab calls: retry transient failures automatically; if the system stays down, raise a review
# so a person decides whether to retry (e.g. once the EHR is back) or stop — instead of failing the
# assessment.
final workflow:RetryBeforeReview & readonly FHIR_RETRY = {
    maxRetries: fhirMaxRetries,
    retryDelay: fhirRetryDelaySeconds,
    retryBackoff: 2,
    maxRetryDelay: fhirMaxRetryDelaySeconds,
    userRoles: "operations",
    title: "A system of record is not responding",
    description: "Automatic retries are spent. Retry once the system is back, or stop the assessment."
};

# Model calls: slower and more expensive, so fewer retries with longer gaps. When they are spent — the
# model is down, or Agent Manager's AI gateway refuses the agent because its budget is used up — a
# person decides: raise the budget in Agent Manager and retry, or stop. The assessment is not lost.
final workflow:RetryBeforeReview & readonly AGENT_RETRY = {
    maxRetries: AGENT_MAX_RETRIES,
    retryDelay: 5,
    retryBackoff: 2,
    userRoles: "operations",
    title: "An AI agent could not complete its step",
    description: "Automatic retries are spent. If Agent Manager refused the agent (429: its budget is used up), "
        + "raise the agent's budget in Agent Manager and retry; otherwise retry once the model is back, or stop."
};

# Automatic retries of an agent step before a person is asked.
const int AGENT_MAX_RETRIES = 2;

# Human task names, which the API uses to find and complete the open task. The workflow passes them
# as literals: ballerina/workflow registers each task under its name at compile time.
const string TASK_ORDER_LABS = "orderLabs";
const string TASK_LAB_VISIT = "labVisit";
const string TASK_REVIEW = "reviewAndRelease";

@workflow:Workflow
function longevityAssessment(workflow:Context ctx, AssessmentInput input, AssessmentEvents events)
        returns AssessmentOutcome|error {
    string id = input.assessmentId;
    do {
        // Pull the record from the patient's EHR and build the summary (deterministic), then open the visit.
        PatientSummary summary = check ctx->callActivity(buildPatientSummary,
                {assessmentId: id, ehr: input.ehr, patientId: input.patientId}, retryPolicy = FHIR_RETRY);
        string encounterId = check ctx->callActivity(openEhrEncounter,
                {assessmentId: id, ehr: input.ehr, patientId: input.patientId, practitionerId: input.practitionerId},
                retryPolicy = FHIR_RETRY);

        // ⏸ Physician: explores the record, evaluates it with the Copilot (outside the workflow, in
        // the same agent conversation) and orders labs.
        LabOrderApproval approval = check ctx->awaitHumanTask("orderLabs",
                {patient: summary.patient.name, ehr: summary.patient.ehrName},
                userRoles = "physician", title = "Evaluate and order labs",
                description = string `Review ${summary.patient.name}'s record, evaluate it with the Copilot and order labs.`);
        LabOrderPlaced labOrder = check ctx->callActivity(placeLabOrder,
                {assessmentId: id, ehr: input.ehr, patientId: input.patientId, encounterId,
                    practitionerId: input.practitionerId, approval},
                retryPolicy = FHIR_RETRY);
        PatientNotification _ = check ctx->callActivity(notifyPatient,
                {assessmentId: id, ehr: input.ehr, patientId: input.patientId, encounterId,
                    practitionerId: input.practitionerId, labOrder},
                retryPolicy = FHIR_RETRY);

        // ⏸ Patient: goes to the lab. The lab completes the task when it collects the specimen.
        LabVisit visit = check ctx->awaitHumanTask("labVisit",
                {patient: summary.patient.name, lab: labDisplayName, tests: labOrder.tests},
                userRoles = ["patient", "lab"], title = "Visit the lab",
                description = string `${summary.patient.name} goes to ${labDisplayName} for the blood draw.`,
                timeout = {days: labVisitTimeoutDays});
        () _ = check ctx->callActivity(recordLabVisit, {assessmentId: id, visit});

        // ⏸ Lab: processes the sample. Signalled by its webhook or, if that is missed, the fallback poller.
        [LabResultNotice] [notice] = check ctx->await([events.labResultReady],
                timeout = {hours: labResultTimeoutHours});

        // The rest runs unattended: results into the EHR, both agents, the draft note.
        LabResults results = check ctx->callActivity(collectLabResults,
                {assessmentId: id, ehr: input.ehr, patientId: input.patientId, encounterId, labOrder, notice},
                retryPolicy = FHIR_RETRY);
        ResultsAnalysis analysis = check ctx->callActivity(analyseResults,
                {assessmentId: id, summary, approval, results}, retryPolicy = AGENT_RETRY);
        CarePlanResult plan = check ctx->callActivity(writeCarePlan,
                {assessmentId: id, summary, approval, analysis}, retryPolicy = AGENT_RETRY);
        string noteId = check ctx->callActivity(fileDraftNote,
                {assessmentId: id, ehr: input.ehr, patientId: input.patientId, encounterId,
                    practitionerId: input.practitionerId, plan},
                retryPolicy = FHIR_RETRY);

        // ⏸ Physician: reviews the analysis and the draft, and releases it to the patient.
        PhysicianRelease release = check ctx->awaitHumanTask("reviewAndRelease",
                {patient: summary.patient.name, headline: analysis.headline},
                userRoles = "physician", title = "Review and release",
                description = string `Review the analysis and care plan for ${summary.patient.name}, then release it to the patient.`);
        () _ = check ctx->callActivity(finalizeInEhr,
                {assessmentId: id, ehr: input.ehr, encounterId, noteId, practitionerId: input.practitionerId,
                    plan, release},
                retryPolicy = FHIR_RETRY);
        () _ = check ctx->callActivity(publishLongevityRecord,
                {assessmentId: id, summary, results, analysis, plan, release, noteId});

        return {assessmentId: id, status: "completed", clinicalNoteId: noteId};
    } on fail error failure {
        () _ = check ctx->callActivity(recordFailure, {assessmentId: id, message: describeError(failure)});
        return failure;
    }
}
