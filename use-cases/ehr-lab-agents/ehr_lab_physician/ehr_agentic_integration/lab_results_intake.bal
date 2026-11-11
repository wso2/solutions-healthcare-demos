import ballerina/log;
import ballerina/task;
import ballerina/workflow;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// Two things arrive from the lab, each by two paths:
//   - "specimen collected": completes the patient's lab-visit human task;
//   - "report ready": the system event the workflow waits on for results.
// The lab's FHIR messages (POST /fhir/r4/$process-message, fhir_api.bal) deliver them immediately with the
// resources (lab_messages.bal); this fallback poller reads the same resources from the lab's FHIR server
// when a message never arrived. Both paths hand on the same typed FHIR resources and are idempotent — a
// completed task cannot be completed twice, and the workflow takes the first `labResultReady` — and
// checking a status is a plain comparison, so neither path involves an LLM.

# Tag system on the lab-results event: which path noticed the report (`lab-webhook` or `fallback-poll`).
const string LAB_NOTICE_PATH_SYSTEM = "urn:demo:longevity:lab-notice-path";

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
    // The task's result is the lab's Specimen itself, with who completed the task as its collector.
    international401:Specimen visit = specimen.clone();
    international401:SpecimenCollection collection = visit.collection ?: {};
    collection.collectedDateTime = collection.collectedDateTime ?: nowIso();
    collection.collector = {display: string `${labDisplayName} (${via})`};
    visit.collection = collection;
    check completeTask(taskId, check fhirJson(visit), "lab", "lab-system");
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
    // The event carries the lab's resources as a FHIR `collection` Bundle, tagged with the path that noticed it.
    r4:BundleEntry[] entries = [{fullUrl: string `${labFhirBaseUrl}/DiagnosticReport/${reportId}`, 'resource: report}];
    foreach international401:Observation observation in observations {
        entries.push({fullUrl: string `${labFhirBaseUrl}/Observation/${observation.id ?: ""}`, 'resource: observation});
    }
    r4:Bundle notice = {
        'type: "collection",
        timestamp: nowIso(),
        meta: {tag: [{system: LAB_NOTICE_PATH_SYSTEM, code: via == "lab webhook" ? "lab-webhook" : "fallback-poll", display: via}]},
        entry: entries
    };
    check workflow:sendData(longevityAssessment, assessment.id, "labResultReady", check fhirJson(notice));
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
