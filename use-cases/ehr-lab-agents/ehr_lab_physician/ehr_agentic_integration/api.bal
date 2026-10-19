import ballerina/http;
import ballerina/lang.'int as langint;
import ballerina/log;
import ballerina/random;
import ballerina/workflow;

// The API the demo portal uses. Reads of an EHR go straight to it through the FHIR connector;
// physician actions complete the workflow's human tasks; assessment reads come from the read model.
// Copilot runs happen in the background so a slow model call never holds an HTTP request open.

public function main() returns error? {
    check startLabResultsPoller();
}

# Starts an assessment.
#
# + ehr - the patient's EHR
# + patientId - the patient's id in that EHR
# + practitionerId - the physician; the demo physician when omitted
type StartAssessmentRequest record {|
    string ehr;
    string patientId;
    string? practitionerId = ();
|};

# A message to the Copilot.
#
# + message - the physician's reply or question
type CopilotMessageRequest record {|
    string message;
|};

# A decision on a review.
#
# + 'retry - true to run the failed step again, false to stop the assessment
type ReviewDecisionRequest record {|
    boolean 'retry;
|};

# Turns a failure switch on or off.
#
# + active - true to start the outage
type FaultRequest record {|
    boolean active;
|};

# A notification from the lab.
#
# + event - `specimen-collected` or `results-ready` (the default)
# + serviceRequestId - the lab's order
# + diagnosticReportId - the report, for `results-ready`
# + specimenId - the specimen, for `specimen-collected`
# + status - the report's status
type LabNotification record {
    string event = "results-ready";
    string serviceRequestId;
    string? diagnosticReportId = ();
    string? specimenId = ();
    string? status = ();
};

# Body of an error response.
#
# + message - what went wrong
type ErrorBody record {|
    string message;
|};

@http:ServiceConfig {
    cors: {
        allowOrigins: corsAllowOrigins,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "X-Lab-Api-Key"]
    }
}
service /api on new http:Listener(apiPort) {

    # Liveness check.
    #
    # + return - `ok`
    resource function get health() returns json => {status: "ok"};

    # What the portal shows about the integration itself.
    #
    # + return - the connected EHRs, the lab, model and workflow settings, and the agents in use
    resource function get system() returns json {
        json[] ehrs = from EhrSystemConfig ehr in ehrSystems
            select {id: ehr.id, name: ehr.displayName, vendor: ehr.vendor, baseUrl: ehr.fhirBaseUrl,
                reachable: ehrReachable(ehr.id), summaryOperation: ehrSupportsSummaryOperation(ehr.id)};
        return {
            ehrs,
            lab: {name: labDisplayName, baseUrl: labFhirBaseUrl},
            model: {provider: modelProvider, name: anthropicModelName, configured: checkModelConfigured() is ()},
            workflow: {engine: "Temporal", uiUrl: temporalUiUrl},
            agents: ["Diagnostic Copilot", "Results Analysis", "Care Plan"],
            agentManager: agentManagerView().toJson()
        };
    }

    # What each agent may do, asked live of WSO2 Agent Manager's identity provider.
    #
    # + return - the access matrix
    resource function get agent\-manager/access() returns AccessMatrix => accessMatrix();

    # Makes a real, harmless MCP call as an agent through Agent Manager's MCP proxy.
    #
    # + request - `{agent, permission}`
    # + return - what happened, or 400 for an unknown agent or permission
    resource function post agent\-manager/probes(record {|string agent; string permission;|} request)
            returns ProbeResult|http:BadRequest {
        ProbeResult|error result = probeAccess(request.agent, request.permission);
        if result is error {
            return <http:BadRequest>{body: {message: result.message()}};
        }
        return result;
    }

    # What the agents have used and spent — per agent, run and assessment — priced with the AI gateway's
    # price list, with the per-agent budgets Agent Manager enforces.
    #
    # + assessment - only this assessment's agent runs
    # + return - the usage, or 502 if the ledger cannot be read
    resource function get agent\-manager/usage(string? assessment) returns json|http:BadGateway {
        json|error usage = agentUsage(assessment);
        if usage is error {
            return <http:BadGateway>{body: <ErrorBody>{message: "Usage ledger unavailable: " + usage.message()}};
        }
        return usage;
    }

    # The data types the explorer can fetch.
    #
    # + return - each kind with its label and the FHIR resource behind it
    resource function get explorer\-kinds() returns json =>
        from ExplorerKind kind in EXPLORER_KINDS
        select {kind: kind.kind, label: kind.label, resourceType: kind.resourceType};

    # The tests the clinic can order.
    #
    # + return - the lab catalog
    resource function get lab\-catalog() returns json => getLabCatalog();

    // ── Patients in an EHR ──

    # Searches an EHR's patients.
    #
    # + ehr - the EHR id
    # + q - an MRN or part of a name; blank lists the clinic's patients
    # + birthdate - optional birth date filter
    # + return - the matching patients, or 502 if the EHR search fails
    resource function get ehrs/[string ehr]/patients(string q = "", string? birthdate = ())
            returns PatientCard[]|http:BadGateway {
        PatientCard[]|error patients = searchEhrPatients(ehr, q, birthdate);
        if patients is error {
            log:printError("EHR patient search failed", patients, ehr = ehr);
            return <http:BadGateway>{body: <ErrorBody>{message: string `${ehrName(ehr)} search failed: ${describeError(patients)}`}};
        }
        return patients;
    }

    # One patient.
    #
    # + ehr - the EHR id
    # + id - the patient's id in that EHR
    # + return - the patient, or 404
    resource function get ehrs/[string ehr]/patients/[string id]() returns PatientCard|http:NotFound {
        EhrSystemConfig|error system = ehrSystem(ehr);
        var patient = readEhrPatient(ehr, id);
        if system is error || patient is error {
            return <http:NotFound>{body: <ErrorBody>{message: string `Patient ${id} not found in ${ehrName(ehr)}`}};
        }
        return patientCard(system, patient);
    }

    # The patient summary (IPS sections, trends, flags), built live from the EHR.
    #
    # + ehr - the EHR id
    # + id - the patient's id in that EHR
    # + return - the summary, or 502 if the EHR cannot be read
    resource function get ehrs/[string ehr]/patients/[string id]/summary() returns PatientSummary|http:BadGateway {
        PatientSummary|error summary = liveSummary(ehr, id);
        if summary is error {
            return <http:BadGateway>{body: <ErrorBody>{message: describeError(summary)}};
        }
        return summary;
    }

    # The International Patient Summary as a FHIR document Bundle.
    #
    # + ehr - the EHR id
    # + id - the patient's id in that EHR
    # + return - the IPS Bundle, or 502 if the EHR cannot be read
    resource function get ehrs/[string ehr]/patients/[string id]/ips() returns json|http:BadGateway {
        do {
            EhrSystemConfig system = check ehrSystem(ehr);
            EhrRecord ehrRecord = check fetchEhrRecord(ehr, id);
            return buildIpsBundle(system, ehrRecord);
        } on fail error failure {
            return <http:BadGateway>{body: <ErrorBody>{message: describeError(failure)}};
        }
    }

    # The EHR data explorer.
    #
    # + ehr - the EHR id
    # + id - the patient's id in that EHR
    # + kinds - data types (see /explorer-kinds), repeated or comma-separated; none for all
    # + 'from - earliest date (YYYY-MM-DD)
    # + to - latest date (YYYY-MM-DD)
    # + return - the records with the FHIR searches that produced them, or 502 if the EHR cannot be read
    resource function get ehrs/[string ehr]/patients/[string id]/records(string[] kinds = [], string? 'from = (),
            string? to = ()) returns ExplorerResult|http:BadGateway {
        string[] selected = [];
        foreach string value in kinds {
            foreach string kind in re `,`.split(value) {
                if kind.trim().length() > 0 {
                    selected.push(kind.trim());
                }
            }
        }
        ExplorerResult|error result = exploreEhrRecords(ehr, id, selected, 'from, to);
        if result is error {
            log:printError("EHR explorer query failed", result, ehr = ehr, patientId = id);
            return <http:BadGateway>{body: <ErrorBody>{message: string `${ehrName(ehr)}: ${describeError(result)}`}};
        }
        return result;
    }

    # The patient's assessments, newest first.
    #
    # + ehr - the EHR id
    # + id - the patient's id in that EHR
    # + return - the assessments, or 500 if the read model cannot be read
    resource function get ehrs/[string ehr]/patients/[string id]/assessments() returns json|http:InternalServerError {
        AssessmentRow[]|error rows = listAssessments(ehr, id);
        if rows is error {
            return <http:InternalServerError>{body: <ErrorBody>{message: rows.message()}};
        }
        return from AssessmentRow row in rows select assessmentListItem(row);
    }

    # The published Longevity Record for a patient (what the patient app reads).
    #
    # + ehr - the EHR id
    # + id - the patient's id in that EHR
    # + return - the Longevity Record, 404 if none has been published yet, or 500 if it cannot be read
    resource function get ehrs/[string ehr]/patients/[string id]/longevity\-record()
            returns json|http:NotFound|http:InternalServerError {
        json?|error longevityRecord = getLongevityRecord(ehr, id);
        if longevityRecord is error {
            return <http:InternalServerError>{body: <ErrorBody>{message: longevityRecord.message()}};
        }
        if longevityRecord is () {
            return <http:NotFound>{body: <ErrorBody>{message: "No longevity record has been published for this patient yet"}};
        }
        return longevityRecord;
    }

    # What the patient app shows: where the patient's latest assessment is, what they need to do, and
    # their report once the physician has released it.
    #
    # + ehr - the EHR id
    # + id - the patient's id in that EHR
    # + return - the patient's journey, or 500 if the read model cannot be read
    resource function get ehrs/[string ehr]/patients/[string id]/journey() returns json|http:InternalServerError {
        do {
            AssessmentRow[] rows = check listAssessments(ehr, id, 1);
            json?|error published = getLongevityRecord(ehr, id);
            json? longevityRecord = published is json ? published : ();
            if rows.length() == 0 {
                return {assessment: (), longevityRecord};
            }
            AssessmentRow? row = check getAssessment(rows[0].id);
            if row is () {
                return {assessment: (), longevityRecord};
            }
            return {assessment: patientJourney(row), longevityRecord};
        } on fail error failure {
            return <http:InternalServerError>{body: <ErrorBody>{message: failure.message()}};
        }
    }

    # Patients who have assessments, for the patient app's sign-in list.
    #
    # + return - one entry per patient, with their latest assessment's stage
    resource function get patient\-app/patients() returns json|http:InternalServerError {
        AssessmentRow[]|error rows = listAssessments();
        if rows is error {
            return <http:InternalServerError>{body: <ErrorBody>{message: rows.message()}};
        }
        map<json> byPatient = {};
        foreach AssessmentRow row in rows {
            string key = row.ehr + "/" + row.patientId;
            if !byPatient.hasKey(key) {
                byPatient[key] = {ehr: row.ehr, ehrName: ehrName(row.ehr), patientId: row.patientId,
                    patientName: row.patientName, stage: row.stage, updatedAt: row.updatedAt};
            }
        }
        return byPatient.toArray();
    }

    # Every published Longevity Record.
    #
    # + return - the patients with a record and when it was published
    resource function get longevity\-records() returns json|http:InternalServerError {
        var rows = listLongevityRecordPatients();
        if rows is error {
            return <http:InternalServerError>{body: <ErrorBody>{message: rows.message()}};
        }
        return rows.toJson();
    }

    // ── Assessments ──

    # Starts an assessment, or returns the patient's assessment that is still open.
    #
    # + request - the patient and physician
    # + return - 201 with the new assessment's id, 200 with an open one's, 404 for an unknown patient, or 500
    resource function post assessments(StartAssessmentRequest request)
            returns http:Created|http:Ok|http:NotFound|http:InternalServerError {
        var patient = readEhrPatient(request.ehr, request.patientId);
        if patient is error {
            return <http:NotFound>{body: <ErrorBody>{message: string `Patient ${request.patientId} not found in ${ehrName(request.ehr)}`}};
        }
        string practitionerId = request.practitionerId ?: defaultPractitionerId;
        do {
            AssessmentRow[] existing = check listAssessments(request.ehr, request.patientId);
            foreach AssessmentRow row in existing {
                if row.stage != COMPLETED && row.stage != FAILED {
                    return <http:Ok>{body: {id: row.id, existing: true}};
                }
            }
            string id = check newAssessmentId();
            string name = patientName(patient.name);
            check insertAssessment(id, request.ehr, request.patientId, name, practitionerId);
            addEvent(id, PHYSICIAN, "Assessment started", string `Patient ${name} selected from ${ehrName(request.ehr)}`);
            _ = check workflow:runWithId(longevityAssessment, id,
                    {assessmentId: id, ehr: request.ehr, patientId: request.patientId, practitionerId});
            addEvent(id, WORKFLOW, "Workflow started", string `Temporal workflow ${id}`);
            return <http:Created>{body: {id, existing: false}};
        } on fail error failure {
            log:printError("Could not start an assessment", failure);
            return <http:InternalServerError>{body: <ErrorBody>{message: failure.message()}};
        }
    }

    # Every assessment, newest first, for the physician's board.
    #
    # + return - the assessments, or 500 if the read model cannot be read
    resource function get assessments() returns json|http:InternalServerError {
        AssessmentRow[]|error rows = listAssessments();
        if rows is error {
            return <http:InternalServerError>{body: <ErrorBody>{message: rows.message()}};
        }
        return from AssessmentRow row in rows select assessmentListItem(row);
    }

    # One assessment: its step outputs, timeline and open tasks.
    #
    # + id - the assessment id
    # + return - the assessment, 404, or 500 if the read model cannot be read
    resource function get assessments/[string id]() returns json|http:NotFound|http:InternalServerError {
        AssessmentRow?|error row = getAssessment(id);
        if row is error {
            return <http:InternalServerError>{body: <ErrorBody>{message: row.message()}};
        }
        if row is () {
            return <http:NotFound>{body: <ErrorBody>{message: string `Assessment ${id} not found`}};
        }
        TimelineEvent[]|error timeline = getTimeline(id);
        json|error data = row.data.fromJsonString();
        map<string>|error tasks = openHumanTasks(id);
        map<string>|error reviews = openReviewTasks(id);
        return {
            id: row.id, ehr: row.ehr, ehrName: ehrName(row.ehr), patientId: row.patientId, patientName: row.patientName,
            practitionerId: row.practitionerId, stage: row.stage, waitingOn: waitingOn(row.stage), 'error: row.'error,
            ehrEncounterId: row.ehrEncounterId, labServiceRequestId: row.labServiceRequestId,
            createdAt: row.createdAt, updatedAt: row.updatedAt,
            data: data is json ? data : {},
            openTasks: tasks is map<string> ? tasks : {},
            openReviews: reviews is map<string> ? reviews : {},
            timeline: timeline is TimelineEvent[] ? timeline.toJson() : []
        };
    }

    # The live workflow: each step's state and the execution history.
    #
    # + id - the assessment id
    # + return - the workflow view, or 502 if the workflow engine cannot be read
    resource function get assessments/[string id]/workflow() returns WorkflowView|http:BadGateway {
        WorkflowView|error view = workflowView(id);
        if view is error {
            return <http:BadGateway>{body: <ErrorBody>{message: view.message()}};
        }
        return view;
    }

    // ── Physician actions ──

    # Asks the Copilot to evaluate the records the physician selected in the explorer. Runs in the
    # background; the evaluation appears in the assessment's `data.evaluation`.
    #
    # + id - the assessment id
    # + request - the selected records, date range and question
    # + return - 202 once the evaluation has started, 400 without records, 404, 409 unless the assessment is
    # waiting on the physician, or 500
    resource function post assessments/[string id]/evaluations(EvaluationRequest request)
            returns http:Accepted|http:BadRequest|http:NotFound|http:Conflict|http:InternalServerError {
        if request.records.length() == 0 {
            return <http:BadRequest>{body: <ErrorBody>{message: "Select at least one record to evaluate"}};
        }
        AssessmentRow|http:NotFound|http:Conflict|http:InternalServerError row = assessmentIn(id, AWAITING_PHYSICIAN);
        if row !is AssessmentRow {
            return row;
        }
        do {
            json data = check row.data.fromJsonString();
            PatientSummary summary = check (check data.summary).cloneWithType();
            string question = request.question.trim().length() > 0 ? request.question : "Overview and evaluation of the selected records";
            check appendCopilotMessage(id, "physician", question, request.records.length(), request.dateFrom, request.dateTo, "running");
            addEvent(id, PHYSICIAN, string `Asked the Copilot to evaluate ${request.records.length()} records`, question);
            _ = start evaluateInBackground(id, summary, request);
            return <http:Accepted>{body: {status: "running"}};
        } on fail error failure {
            return <http:InternalServerError>{body: <ErrorBody>{message: failure.message()}};
        }
    }

    # A follow-up to the Copilot, in the same conversation.
    #
    # + id - the assessment id
    # + request - the physician's message
    # + return - 202 once the reply has started, 400 for an empty message, 404, 409 unless the assessment is
    # waiting on the physician, or 500
    resource function post assessments/[string id]/copilot\-messages(CopilotMessageRequest request)
            returns http:Accepted|http:BadRequest|http:NotFound|http:Conflict|http:InternalServerError {
        if request.message.trim().length() == 0 {
            return <http:BadRequest>{body: <ErrorBody>{message: "The message is empty"}};
        }
        AssessmentRow|http:NotFound|http:Conflict|http:InternalServerError row = assessmentIn(id, AWAITING_PHYSICIAN);
        if row !is AssessmentRow {
            return row;
        }
        error? stored = appendCopilotMessage(id, "physician", request.message, (), (), (), "running");
        if stored is error {
            return <http:InternalServerError>{body: <ErrorBody>{message: stored.message()}};
        }
        addEvent(id, PHYSICIAN, "Message to the Copilot", request.message);
        _ = start followUpInBackground(id, row.ehr, request.message);
        return <http:Accepted>{body: {status: "running"}};
    }

    # The physician's lab order: completes the "evaluate and order labs" human task.
    #
    # + id - the assessment id
    # + approval - the tests, note and reason
    # + return - 202, 400 for an empty or unknown test list, 404, 409 unless the order task is open, or 500
    resource function post assessments/[string id]/lab\-order(LabOrderApproval approval)
            returns http:Accepted|http:BadRequest|http:NotFound|http:Conflict|http:InternalServerError {
        if approval.approvedTests.length() == 0 {
            return <http:BadRequest>{body: <ErrorBody>{message: "Order at least one test"}};
        }
        string[] unknown = from string code in approval.approvedTests
            where orderableByCode(code) is ()
            select code;
        if unknown.length() > 0 {
            return <http:BadRequest>{body: <ErrorBody>{message: string `Not in the lab catalog: ${string:'join(", ", ...unknown)}`}};
        }
        return completePhysicianTask(id, AWAITING_PHYSICIAN, TASK_ORDER_LABS, approval, "labOrderApproval",
                string `Physician ordered ${approval.approvedTests.length()} tests`, string:'join(", ", ...approval.approvedTests));
    }

    # The physician's release: completes the "review and release" human task.
    #
    # + id - the assessment id
    # + release - the physician's comment
    # + return - 202, 404, 409 unless the review task is open, or 500
    resource function post assessments/[string id]/release(PhysicianRelease release)
            returns http:Accepted|http:NotFound|http:Conflict|http:InternalServerError {
        return completePhysicianTask(id, AWAITING_REVIEW, TASK_REVIEW, release, "release",
                "Physician reviewed and released the assessment", release.comment == "" ? () : release.comment);
    }

    # Decides an open review: retry the step whose automatic retries were spent, or stop the assessment.
    #
    # + id - the assessment id
    # + taskId - the review task
    # + decision - retry or stop
    # + return - 202, or 409 if the review is not open
    resource function post assessments/[string id]/reviews/[string taskId](ReviewDecisionRequest decision)
            returns http:Accepted|http:Conflict {
        error? decided = decideReview(taskId, decision.'retry, "presenter");
        if decided is error {
            return <http:Conflict>{body: <ErrorBody>{message: decided.message()}};
        }
        addEvent(id, OPERATIONS, decision.'retry ? "Operations retried the failed step" : "Operations stopped the assessment");
        return <http:Accepted>{body: {'retry: decision.'retry}};
    }

    // ── Inbound from the lab ──

    # A notification from the lab: specimen collected, or report ready.
    #
    # + apiKey - the shared secret the lab sends in `X-Lab-Api-Key`
    # + notification - the event and the order it is about
    # + return - 202 with whether the workflow moved on, 401 for a wrong key, or 500
    resource function post lab/notifications(@http:Header {name: "X-Lab-Api-Key"} string? apiKey,
            LabNotification notification) returns http:Accepted|http:Unauthorized|http:InternalServerError {
        if apiKey != labWebhookApiKey {
            return <http:Unauthorized>{body: <ErrorBody>{message: "Invalid lab API key"}};
        }
        boolean|error handled = notification.event == "specimen-collected"
            ? completeLabVisitIfCollected(notification.serviceRequestId, "lab webhook")
            : signalLabResultIfReady(notification.serviceRequestId, "lab webhook");
        if handled is error {
            log:printError("Lab notification could not be processed", handled,
                    serviceRequestId = notification.serviceRequestId, event = notification.event);
            return <http:InternalServerError>{body: <ErrorBody>{message: handled.message()}};
        }
        return <http:Accepted>{body: {handled}};
    }

    // ── Presenter controls ──

    # The failure switches and whether each is on.
    #
    # + return - the switches
    resource function get demo/faults() returns FaultSwitch[] => faultSwitches();

    # Turns a failure switch on or off.
    #
    # + id - the switch id
    # + request - on or off
    # + return - the switches after the change, or 502 if Toxiproxy cannot be reached
    resource function post demo/faults/[string id](FaultRequest request) returns FaultSwitch[]|http:BadGateway {
        error? changed = setFault(id, request.active);
        if changed is error {
            return <http:BadGateway>{body: <ErrorBody>{message: changed.message()}};
        }
        return faultSwitches();
    }

    # Crashes the integration process; Docker restarts it and every workflow carries on.
    #
    # + return - 202, or 403 when crash simulation is disabled
    resource function post demo/crash() returns http:Accepted|http:Forbidden {
        if !allowCrashSimulation {
            return <http:Forbidden>{body: <ErrorBody>{message: "Crash simulation is disabled"}};
        }
        crashSoon();
        return <http:Accepted>{body: {message: "The integration will exit now and restart"}};
    }
}

// ── Helpers ──

# The patient summary built live from the EHR (the patient page, before any assessment).
#
# + ehr - the EHR id
# + patientId - the patient's id in that EHR
# + return - the summary, or an error if the EHR cannot be read
isolated function liveSummary(string ehr, string patientId) returns PatientSummary|error {
    EhrSystemConfig system = check ehrSystem(ehr);
    EhrRecord ehrRecord = check fetchEhrRecord(ehr, patientId);
    return buildSummary(system, ehrRecord);
}

# Who the assessment is waiting on, from its stage.
#
# + stage - the assessment's stage
# + return - physician, patient, lab, ai, system or none
isolated function waitingOn(string stage) returns string {
    match stage {
        AWAITING_PHYSICIAN|AWAITING_REVIEW => {
            return "physician";
        }
        AWAITING_PATIENT => {
            return "patient";
        }
        AWAITING_LAB => {
            return "lab";
        }
        ANALYZING_RESULTS|GENERATING_CARE_PLAN => {
            return "ai";
        }
        COMPLETED|FAILED => {
            return "none";
        }
    }
    return "system";
}

isolated function assessmentListItem(AssessmentRow row) returns json {
    json|error data = row.data.fromJsonString();
    json|error tests = data is json ? data.labOrder.tests : ();
    json|error headline = data is json ? data.analysis.headline : ();
    return {
        id: row.id, ehr: row.ehr, ehrName: ehrName(row.ehr), patientId: row.patientId, patientName: row.patientName,
        stage: row.stage, waitingOn: waitingOn(row.stage), 'error: row.'error,
        tests: tests is json[] ? tests : [], headline: headline is string ? headline : (),
        createdAt: row.createdAt, updatedAt: row.updatedAt
    };
}

# The patient-facing view of an assessment: plain steps, what to do, nothing clinical before release.
#
# + row - the assessment
# + return - the journey
isolated function patientJourney(AssessmentRow row) returns json {
    json|error parsed = row.data.fromJsonString();
    json data = parsed is json ? parsed : {};
    string step = "consultation";
    match row.stage {
        PLACING_LAB_ORDER|AWAITING_PATIENT => {
            step = "visit-lab";
        }
        AWAITING_LAB => {
            step = "processing";
        }
        ANALYZING_RESULTS|GENERATING_CARE_PLAN|AWAITING_REVIEW => {
            step = "reviewing";
        }
        COMPLETED => {
            step = "ready";
        }
        FAILED => {
            step = "stopped";
        }
    }
    json|error testCodes = data.labOrder.tests;
    json[] tests = [];
    if testCodes is json[] {
        foreach json code in testCodes {
            OrderableTest? test = orderableByCode(code.toString());
            tests.push({code: code.toString(), name: test is OrderableTest ? test.name : code.toString(),
                preparation: test is OrderableTest ? test.preparation : ()});
        }
    }
    json|error notification = data.patientNotification;
    json|error visit = data.labVisit;
    json|error placerOrder = data.labOrder.placerOrderId;
    return {
        id: row.id, ehr: row.ehr, ehrName: ehrName(row.ehr), stage: row.stage, step,
        startedAt: row.createdAt, updatedAt: row.updatedAt,
        tests, orderNumber: placerOrder is string ? placerOrder : (),
        notification: notification is json ? notification : (),
        labVisit: visit is json ? visit : (),
        labName: labDisplayName
    };
}

# The assessment, if it is in the given stage.
#
# + id - the assessment id
# + expected - the stage it must be in
# + return - the assessment, 404, 409 when it is in another stage, or 500
isolated function assessmentIn(string id, Stage expected)
        returns AssessmentRow|http:NotFound|http:Conflict|http:InternalServerError {
    AssessmentRow?|error row = getAssessment(id);
    if row is error {
        return <http:InternalServerError>{body: <ErrorBody>{message: row.message()}};
    }
    if row is () {
        return <http:NotFound>{body: <ErrorBody>{message: string `Assessment ${id} not found`}};
    }
    if row.stage != expected {
        return <http:Conflict>{body: <ErrorBody>{message: string `Assessment is in ${row.stage}; this action needs ${expected}`}};
    }
    return row;
}

# Completes one of the physician's human tasks and records the input on the read model.
#
# + id - the assessment id
# + expected - the stage the assessment must be in
# + taskName - the human task to complete
# + payload - the task's result
# + dataKey - where the payload is stored in the assessment's `data`
# + title - timeline event title
# + detail - timeline event detail
# + return - 202, 404, 409 when the assessment is in another stage or the task is not open, or 500
isolated function completePhysicianTask(string id, Stage expected, string taskName, anydata payload, string dataKey,
        string title, string? detail) returns http:Accepted|http:NotFound|http:Conflict|http:InternalServerError {
    AssessmentRow|http:NotFound|http:Conflict|http:InternalServerError row = assessmentIn(id, expected);
    if row !is AssessmentRow {
        return row;
    }
    do {
        string? taskId = check pendingHumanTaskId(id, taskName);
        if taskId is () {
            return <http:Conflict>{body: <ErrorBody>{message: string `No open "${taskName}" task for ${id} yet`}};
        }
        check completeTask(taskId, payload, "physician", row.practitionerId);
        check putData(id, dataKey, payload.toJson());
        addEvent(id, PHYSICIAN, title, detail);
        return <http:Accepted>{body: {taskId}};
    } on fail error failure {
        log:printError("Could not complete a physician task", failure, assessmentId = id, task = taskName);
        return <http:InternalServerError>{body: <ErrorBody>{message: failure.message()}};
    }
}

isolated function evaluateInBackground(string id, PatientSummary summary, EvaluationRequest request) {
    CopilotEvaluation|error evaluation = runCopilotEvaluation(id, summary, request);
    storeCopilotResult(id, evaluation, "Diagnostic Copilot: evaluation ready");
}

isolated function followUpInBackground(string id, string ehr, string message) {
    CopilotEvaluation|error evaluation = runCopilotFollowUp(id, ehr, message);
    storeCopilotResult(id, evaluation, "Diagnostic Copilot replied");
}

isolated function storeCopilotResult(string id, CopilotEvaluation|error evaluation, string title) {
    if evaluation is error {
        error failure = compactAgentError("Diagnostic Copilot", evaluation);
        logIfError(appendCopilotMessage(id, "copilot", string `I could not finish: ${failure.message()}`, (), (), (), "failed"), id);
        addEvent(id, AGENT, "Diagnostic Copilot failed", failure.message(), "error");
        return;
    }
    logIfError(putData(id, "evaluation", evaluation.toJson()), id);
    logIfError(appendCopilotMessage(id, "copilot", evaluation.reply, (), (), (), "idle"), id);
    addEvent(id, AGENT, title, string `${evaluation.keyFindings.length()} findings, ${evaluation.recommendedTests.length()} tests proposed`);
}

# Appends a message to the assessment's Copilot conversation (as the portal shows it) and sets its status.
#
# + id - the assessment id
# + role - physician or copilot
# + text - the message
# + recordCount - how many explorer rows came with it
# + dateFrom - the date range's start
# + dateTo - the date range's end
# + status - running while the Copilot works, idle when done, failed on error
# + return - an error if the read model cannot be read or updated
isolated function appendCopilotMessage(string id, string role, string text, int? recordCount, string? dateFrom,
        string? dateTo, string status) returns error? {
    AssessmentRow? row = check getAssessment(id);
    if row is () {
        return;
    }
    json data = check row.data.fromJsonString();
    json|error existing = data.copilot.messages;
    json[] messages = existing is json[] ? existing.clone() : [];
    map<json> message = {role, text, at: nowIso()};
    if recordCount is int {
        message["records"] = recordCount;
        message["dateFrom"] = dateFrom;
        message["dateTo"] = dateTo;
    }
    messages.push(message);
    check putData(id, "copilot", {status, messages});
}

isolated function logIfError(error? result, string assessmentId) {
    if result is error {
        log:printError("Could not update the assessment read model", result, assessmentId = assessmentId);
    }
}

isolated function newAssessmentId() returns string|error {
    int value = check random:createIntInRange(0, 16777215);
    string hex = langint:toHexString(value);
    while hex.length() < 6 {
        hex = "0" + hex;
    }
    return string `asm-${hex}`;
}
