import ballerina/log;
import ballerina/task;
import ballerina/workflow;

// Two things arrive from the lab, each by two paths:
//   - "specimen collected": completes the patient's lab-visit human task;
//   - "report ready": the system event the workflow waits on for results.
// The lab's webhook (POST /api/lab/notifications) delivers them immediately; this fallback poller
// catches a notification the lab never sent or we never received. Both paths are idempotent — a
// completed task cannot be completed twice, and the workflow takes the first `labResultReady` — and
// checking a status is a plain comparison, so neither path involves an LLM.

# Completes the patient's lab-visit task if the lab has collected the specimen.
#
# + labServiceRequestId - the lab order
# + via - which path noticed it ("lab webhook" or "fallback poll"), for the audit trail
# + return - true when the task was completed, or an error if the lab or the workflow cannot be reached
isolated function completeLabVisitIfCollected(string labServiceRequestId, string via) returns boolean|error {
    AssessmentRow? assessment = check findAssessmentByLabOrder(labServiceRequestId);
    if assessment is () || assessment.stage != AWAITING_PATIENT {
        return false;
    }
    [string, string]? specimen = check findSpecimen(labServiceRequestId);
    if specimen is () {
        return false;
    }
    string? taskId = check pendingHumanTaskId(assessment.id, TASK_LAB_VISIT);
    if taskId is () {
        return false;
    }
    LabVisit visit = {specimenId: specimen[0], collectedAt: specimen[1], collectedBy: string `${labDisplayName} (${via})`};
    check completeTask(taskId, visit, "lab", "lab-system");
    return true;
}

# Signals a waiting assessment that its lab report is ready, if the report is final.
#
# + labServiceRequestId - the lab order the report belongs to
# + via - which path noticed it ("lab webhook" or "fallback poll"), for the timeline
# + return - true when the assessment was signalled, or an error if the lab or the workflow cannot be reached
isolated function signalLabResultIfReady(string labServiceRequestId, string via) returns boolean|error {
    AssessmentRow? assessment = check findAssessmentByLabOrder(labServiceRequestId);
    if assessment is () || assessment.stage != AWAITING_LAB {
        return false;
    }
    json? report = check findLabReport(labServiceRequestId);
    if report is () {
        return false;
    }
    json|error status = report.status;
    json|error reportId = report.id;
    if status !is string || !isFinalReportStatus(status) || reportId !is string {
        return false;
    }
    LabResultNotice notice = {serviceRequestId: labServiceRequestId, diagnosticReportId: reportId, status, via};
    check workflow:sendData(longevityAssessment, assessment.id, "labResultReady", notice);
    return true;
}

# The fallback poller: checks every assessment waiting on the patient or the lab.
class LabResultsPoller {
    *task:Job;

    # One poll.
    public function execute() {
        self.poll(AWAITING_PATIENT, completeLabVisitIfCollected, "specimen");
        self.poll(AWAITING_LAB, signalLabResultIfReady, "report");
    }

    function poll(Stage stage, isolated function (string, string) returns boolean|error checkOrder, string what) {
        AssessmentRow[]|error waiting = assessmentsInStage(stage);
        if waiting is error {
            log:printError("Fallback lab poll could not list waiting assessments", waiting);
            return;
        }
        foreach AssessmentRow assessment in waiting {
            string? labOrder = assessment.labServiceRequestId;
            if labOrder is () {
                continue;
            }
            boolean|error found = checkOrder(labOrder, "fallback poll");
            if found is error {
                log:printWarn("Fallback lab poll failed for an assessment", found, assessmentId = assessment.id);
            } else if found {
                log:printInfo(string `Fallback lab poll found a ${what}`, assessmentId = assessment.id);
            }
        }
    }
}

function startLabResultsPoller() returns error? {
    _ = check task:scheduleJobRecurByFrequency(new LabResultsPoller(), labPollIntervalSeconds);
    log:printInfo("Fallback lab poller scheduled", intervalSeconds = labPollIntervalSeconds);
}
