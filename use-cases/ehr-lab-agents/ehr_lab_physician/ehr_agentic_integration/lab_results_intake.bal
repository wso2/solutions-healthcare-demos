import ballerina/log;
import ballerina/task;
import ballerina/workflow;
import ballerinax/health.fhir.r4.international401;

// Two things arrive from the lab, each by two paths:
//   - "specimen collected": completes the patient's lab-visit human task;
//   - "report ready": the system event the workflow waits on for results.
// The lab's webhook (POST /api/lab/notifications) delivers them immediately as FHIR messages that carry the
// resources (lab_messages.bal); this fallback poller reads the same resources from the lab's FHIR server
// when a message never arrived. Both paths hand on the same typed FHIR resources and are idempotent — a
// completed task cannot be completed twice, and the workflow takes the first `labResultReady` — and
// checking a status is a plain comparison, so neither path involves an LLM.

# Completes the patient's lab-visit task with the specimen the lab collected.
#
# + labServiceRequestId - the lab order
# + specimen - the lab's Specimen
# + via - which path noticed it ("lab webhook" or "fallback poll"), for the audit trail
# + return - true when the task was completed, or an error if the workflow cannot be reached
isolated function completeLabVisit(string labServiceRequestId, international401:Specimen specimen, string via)
        returns boolean|error {
    AssessmentRow? assessment = check findAssessmentByLabOrder(labServiceRequestId);
    if assessment is () || assessment.stage != AWAITING_PATIENT {
        return false;
    }
    string? specimenId = specimen.id;
    if specimenId is () {
        return error("The lab's Specimen has no id");
    }
    string? taskId = check pendingHumanTaskId(assessment.id, TASK_LAB_VISIT);
    if taskId is () {
        return false;
    }
    LabVisit visit = {
        specimenId,
        collectedAt: specimen.collection?.collectedDateTime ?: nowIso(),
        collectedBy: string `${labDisplayName} (${via})`
    };
    check completeTask(taskId, visit, "lab", "lab-system");
    return true;
}

# Signals a waiting assessment that its lab report is ready, if the report is final.
#
# + labServiceRequestId - the lab order the report belongs to
# + report - the lab's DiagnosticReport
# + observations - the Observations it references
# + via - which path noticed it ("lab webhook" or "fallback poll"), for the timeline
# + return - true when the assessment was signalled, or an error if the workflow cannot be reached
isolated function signalLabResult(string labServiceRequestId, international401:DiagnosticReport report,
        international401:Observation[] observations, string via) returns boolean|error {
    AssessmentRow? assessment = check findAssessmentByLabOrder(labServiceRequestId);
    if assessment is () || assessment.stage != AWAITING_LAB {
        return false;
    }
    string? reportId = report.id;
    if !isFinalReportStatus(report.status) || reportId is () {
        return false;
    }
    LabResultNotice notice = {
        serviceRequestId: labServiceRequestId, diagnosticReportId: reportId, status: report.status, via,
        report: report.toJson(),
        observations: from international401:Observation observation in observations select observation.toJson()
    };
    check workflow:sendData(longevityAssessment, assessment.id, "labResultReady", notice);
    return true;
}

# Fallback poll: completes the lab-visit task if the lab has filed a specimen for the order.
#
# + labServiceRequestId - the lab order
# + via - the path, for the audit trail
# + return - true when the task was completed, or an error if the lab or the workflow cannot be reached
isolated function completeLabVisitIfCollected(string labServiceRequestId, string via) returns boolean|error {
    international401:Specimen? specimen = check findSpecimen(labServiceRequestId);
    return specimen is () ? false : completeLabVisit(labServiceRequestId, specimen, via);
}

# Fallback poll: signals the assessment if the lab has a final report for the order.
#
# + labServiceRequestId - the lab order
# + via - the path, for the timeline
# + return - true when the assessment was signalled, or an error if the lab or the workflow cannot be reached
isolated function signalLabResultIfReady(string labServiceRequestId, string via) returns boolean|error {
    international401:DiagnosticReport? report = check findLabReport(labServiceRequestId);
    if report is () || !isFinalReportStatus(report.status) {
        return false;
    }
    return signalLabResult(labServiceRequestId, report, check reportObservations(report), via);
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
