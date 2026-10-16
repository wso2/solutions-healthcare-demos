import ballerina/log;
import ballerina/workflow;

# Durable workflow for one longevity-assessment session. Started when labs are ordered
# (`$order-labs`); it suspends durably while the session is `awaiting-lab-results` and resumes
# the moment the polling agent confirms the Quest lab result is ready for physician review.
#
# + ctx - workflow execution context, used to wait on the external lab-result data event
# + input - the workflow id and the placer-order id to wait for
# + events - external data events this workflow instance waits on
# + return - the lab-result event that resumed the workflow, or an error
@workflow:Workflow
function longevityAssessmentWorkflow(workflow:Context ctx, LabOrderInput input, LabResultEvents events)
        returns LabResultEvent|error {
    // Suspend durably until the polling agent signals that Quest's DiagnosticReport is final.
    // No sleep-loop or direct Quest call happens here - the workflow function only waits.
    LabResultEvent labResult = check wait events.labResultReady;
    return labResult;
}

// ── Session registry ──
// Lightweight in-memory bookkeeping that maps a workflow (session) id to its durable
// ballerina/workflow instance id and current polling stage. This will be superseded by the
// FHIR Task repository in a later phase; for now it is what the polling agent and the
// order-labs/resume glue below use to find which workflow instance to signal.

const string STAGE_AWAITING_LAB_RESULTS = "awaiting-lab-results";
const string STAGE_READY_FOR_REVIEW = "ready-for-review";

isolated map<WorkflowSession> workflowSessions = {};

# Registers a new workflow session and starts its durable workflow instance, suspended on the
# lab-result event. Call this right after the lab order is accepted by Quest.
# + workflowId - the session id (the FHIR Task / workflow id, e.g. `lw-7f3c2a`)
# + placerOrderId - the placer-order id the workflow should wait for
# + return - the durable workflow instance id, or an error if the workflow could not be started
isolated function startLabResultWait(string workflowId, string placerOrderId) returns string|error {
    string instanceId = check workflow:run(longevityAssessmentWorkflow, {workflowId, placerOrderId});
    WorkflowSession session = {
        workflowId: workflowId,
        instanceId: instanceId,
        placerOrderId: placerOrderId,
        stage: STAGE_AWAITING_LAB_RESULTS
    };
    lock {
        workflowSessions[workflowId] = session.clone();
    }
    log:printInfo("Workflow session registered and waiting for lab result", workflowId = workflowId);
    return instanceId;
}

# Returns a snapshot of every session currently awaiting a lab result - used by the polling job
# to decide which sessions to check with the polling agent this tick.
# + return - the sessions in the `awaiting-lab-results` stage
isolated function getSessionsAwaitingLabResults() returns WorkflowSession[] {
    lock {
        WorkflowSession[] awaitingSessions = [];
        foreach WorkflowSession session in workflowSessions {
            if session.stage == STAGE_AWAITING_LAB_RESULTS {
                awaitingSessions.push(session.clone());
            }
        }
        return awaitingSessions.clone();
    }
}

# Marks a session as ready for physician review and signals its durable workflow instance with
# the lab result event, resuming it. Called by the polling agent once Quest's DiagnosticReport
# is final.
# + workflowId - the session id to resume
# + labResult - the lab result event to deliver to the waiting workflow
# + return - an error if the session is unknown or the signal could not be delivered
isolated function resumeWithLabResult(string workflowId, LabResultEvent labResult) returns error? {
    WorkflowSession session;
    lock {
        if !workflowSessions.hasKey(workflowId) {
            return error(string `No workflow session registered for ${workflowId}`);
        }
        session = workflowSessions.get(workflowId).clone();
    }
    check workflow:sendData(longevityAssessmentWorkflow, session.instanceId, "labResultReady", labResult);
    lock {
        WorkflowSession updated = session.clone();
        updated.stage = STAGE_READY_FOR_REVIEW;
        workflowSessions[workflowId] = updated;
    }
    log:printInfo("Workflow session resumed: lab result ready for review", workflowId = workflowId);
}
