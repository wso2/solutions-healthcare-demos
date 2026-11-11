import ballerina/http;
import ballerina/workflow.management as mgmt;

// The workflow as the portal's Workflow switch shows it, and the helpers the API uses to act on the
// workflow's human tasks and reviews. Everything here reads ballerina/workflow's own management API
// (activity tree, pending human tasks, pending reviews) — the same data the Temporal UI shows, shaped
// for the demo.

# One step of the workflow definition, in the order the workflow runs them.
#
# + key - the activity, human task or data event name
# + label - what the step does, for people
# + kind - activity, agent, human or event
# + actor - who acts
type StepDefinition record {|
    string key;
    string label;
    "activity"|"agent"|"human"|"event" kind;
    string actor;
|};

# Temporal's HTTP API, for the live state of pending activities.
final http:Client temporalHttp = check new (temporalHttpUrl, {timeout: 5, httpVersion: http:HTTP_1_1});

# A pending activity's live retry state.
#
# + attempt - the attempt Temporal is on
# + lastFailure - why the previous attempt failed
type PendingAttempt record {|
    int attempt;
    string? lastFailure;
|};

final readonly & StepDefinition[] WORKFLOW_STEPS = [
    {key: "buildPatientSummary", label: "Pull the record from the EHR", kind: "activity", actor: "system"},
    {key: "openEhrEncounter", label: "Open the visit in the EHR", kind: "activity", actor: "system"},
    {key: TASK_ORDER_LABS, label: "Evaluate with the Copilot and order labs", kind: "human", actor: "physician"},
    {key: "placeLabOrder", label: "Order of record in the EHR, order to the lab", kind: "activity", actor: "system"},
    {key: "notifyPatient", label: "Notify the patient", kind: "activity", actor: "system"},
    {key: TASK_LAB_VISIT, label: "Patient visits the lab", kind: "human", actor: "patient"},
    {key: "labResultReady", label: "Lab results ready", kind: "event", actor: "lab"},
    {key: "collectLabResults", label: "File the results in the EHR", kind: "activity", actor: "system"},
    {key: "analyseResults", label: "Results Analysis agent", kind: "agent", actor: "ai"},
    {key: "writeCarePlan", label: "Care Plan agent", kind: "agent", actor: "ai"},
    {key: "fileDraftNote", label: "Draft note in the EHR", kind: "activity", actor: "system"},
    {key: TASK_REVIEW, label: "Review and release", kind: "human", actor: "physician"},
    {key: "finalizeInEhr", label: "Sign the note, close the visit", kind: "activity", actor: "system"},
    {key: "publishLongevityRecord", label: "Publish the Longevity Record", kind: "activity", actor: "system"}
];

# The live view of an assessment's workflow.
#
# + assessmentId - the assessment (the workflow id)
# + return - the steps with their state and the execution history, or an error if the workflow cannot be read
isolated function workflowView(string assessmentId) returns WorkflowView|error {
    mgmt:WorkflowExecutionInfo info = check mgmt:getWorkflowInfo(assessmentId);
    mgmt:ActivityTreeNode[] tree = check mgmt:getActivityTree(assessmentId, "");
    map<string> openTasks = check openHumanTasks(assessmentId);
    map<string> openReviews = check openReviewTasks(assessmentId);
    map<PendingAttempt> pending = pendingAttempts(assessmentId);

    WorkflowStepView[] steps = [];
    foreach StepDefinition step in WORKFLOW_STEPS {
        steps.push(stepView(step, tree, openTasks, openReviews, pending));
    }
    WorkflowNodeView[] history = from mgmt:ActivityTreeNode node in tree
        select {
            id: node.id, name: node.name, label: nodeLabel(node), 'type: node.'type.toString(), status: node.status,
            startTime: node.startTime, endTime: node.endTime, attempt: node.attempt,
            failure: node.failure is mgmt:FailureInfo ? (<mgmt:FailureInfo>node.failure).message : ()
        };
    return {
        workflowId: assessmentId,
        status: info.status,
        temporalUrl: string `${temporalUiUrl}/namespaces/default/workflows/${assessmentId}`,
        steps,
        history
    };
}

isolated function stepView(StepDefinition step, mgmt:ActivityTreeNode[] tree, map<string> openTasks,
        map<string> openReviews, map<PendingAttempt> pending) returns WorkflowStepView {
    mgmt:ActivityTreeNode[] nodes = from mgmt:ActivityTreeNode node in tree
        where baseName(node.name) == step.key
        select node;
    WorkflowStepView view = {key: step.key, label: step.label, kind: step.kind, actor: step.actor, state: "pending"};
    if nodes.length() == 0 {
        return view;
    }
    mgmt:ActivityTreeNode first = nodes[0];
    mgmt:ActivityTreeNode last = nodes[nodes.length() - 1];
    view.startedAt = first.startTime;
    int attempts = 0;
    foreach mgmt:ActivityTreeNode node in nodes {
        if node.'type == mgmt:ACTIVITY {
            attempts += node.attempt;
        }
    }
    view.attempts = attempts;
    mgmt:FailureInfo? failure = ();
    foreach mgmt:ActivityTreeNode node in nodes {
        if node.failure is mgmt:FailureInfo {
            failure = node.failure;
        }
    }
    view.failure = failure is mgmt:FailureInfo ? failure.message : ();

    string? reviewTask = openReviews[step.key];
    if reviewTask is string {
        // Automatic retries are spent; a person has to decide.
        view.state = "attention";
        view.kind = "review";
        view.actor = "operations";
        view.taskId = reviewTask;
        view.detail = "Retries spent — waiting for someone to retry or stop";
        return view;
    }
    match last.status {
        "COMPLETED" => {
            view.state = "done";
            view.endedAt = last.endTime;
            view.failure = view.attempts > 1 ? view.failure : ();
            view.detail = view.attempts > 1 ? string `Succeeded after ${view.attempts} attempts` : ();
        }
        "FAILED"|"TIMED_OUT"|"CANCELED" => {
            view.state = "failed";
            view.endedAt = last.endTime;
        }
        _ => {
            if step.kind == "human" || step.kind == "event" {
                view.state = "waiting";
                view.taskId = openTasks[step.key];
                view.detail = step.kind == "event" ? "Waiting for the lab's notification" : string `Waiting on the ${step.actor}`;
            } else {
                PendingAttempt? live = pending[step.key];
                int attempt = live is PendingAttempt ? live.attempt : last.attempt;
                view.state = attempt > 1 ? "retrying" : "running";
                view.attempts = attempt;
                int maxAttempts = (step.kind == "agent" ? AGENT_MAX_RETRIES : fhirMaxRetries) + 1;
                view.detail = attempt > 1 ? string `Attempt ${attempt} of ${maxAttempts} — retrying automatically` : ();
                if live is PendingAttempt && live.lastFailure is string {
                    view.failure = live.lastFailure;
                }
            }
        }
    }
    return view;
}

# Live attempt and last failure of the workflow's pending activities, from Temporal's describe API.
# Best effort: without it the view still shows the step as running.
#
# + workflowId - the assessment
# + return - the attempt state by activity name
isolated function pendingAttempts(string workflowId) returns map<PendingAttempt> {
    map<PendingAttempt> attempts = {};
    json|error described = temporalHttp->get(string `/api/v1/namespaces/${temporalNamespace}/workflows/${workflowId}`);
    if described is error {
        return attempts;
    }
    json|error activities = described.pendingActivities;
    if activities !is json[] {
        return attempts;
    }
    foreach json activity in activities {
        string? name = jsonText(activity, "activityType", "name");
        string? attempt = jsonText(activity, "attempt");
        if name is string && attempt is string {
            int|error number = int:fromString(attempt);
            attempts[name] = {attempt: number is int ? number : 1, lastFailure: jsonText(activity, "lastFailure", "message")};
        }
    }
    return attempts;
}

isolated function nodeLabel(mgmt:ActivityTreeNode node) returns string {
    string key = baseName(node.name);
    foreach StepDefinition step in WORKFLOW_STEPS {
        if step.key == key {
            return node.'type == mgmt:REVIEW_ACTIVITY ? string `Review: ${step.label}` : step.label;
        }
    }
    return node.displayName ?: key;
}

# `longevityAssessment.orderLabs` → `orderLabs`: task and review names are qualified by the workflow.
#
# + name - a node, task or activity name
# + return - the name without its workflow prefix
isolated function baseName(string name) returns string {
    int? dot = name.lastIndexOf(".");
    return dot is int ? name.substring(dot + 1) : name;
}

// ── Human tasks and reviews ──

# The workflow's open human tasks, by task name.
#
# + workflowId - the assessment
# + return - task id by task name, or an error if the workflow cannot be read
isolated function openHumanTasks(string workflowId) returns map<string>|error {
    mgmt:HumanTaskGroup[] groups = check mgmt:listPendingHumanTasks(workflowId);
    map<string> tasks = {};
    foreach mgmt:HumanTaskGroup group in groups {
        if group.taskIds.length() > 0 {
            tasks[baseName(group.taskName)] = group.taskIds[0];
        }
    }
    return tasks;
}

# The workflow's open reviews (activities whose automatic retries are spent), by activity name.
#
# + workflowId - the assessment
# + return - review task id by activity name, or an error if the workflow cannot be read
isolated function openReviewTasks(string workflowId) returns map<string>|error {
    mgmt:ReviewActivitySummary[] reviews = check mgmt:listPendingReviewActivities(workflowId);
    map<string> open = {};
    foreach mgmt:ReviewActivitySummary review in reviews {
        open[baseName(review.activityName)] = review.taskId;
    }
    return open;
}

# The id of the workflow's open human task with the given name.
#
# + workflowId - the assessment
# + taskName - the task name, e.g. `orderLabs`
# + return - the task id, nil when no such task is open, or an error if the workflow cannot be read
isolated function pendingHumanTaskId(string workflowId, string taskName) returns string?|error {
    map<string> tasks = check openHumanTasks(workflowId);
    return tasks[taskName];
}

# Completes a human task as someone in the given role. ballerina/workflow checks the role against the
# task's audience and records who completed it.
#
# + taskId - the task
# + result - the task's result
# + role - the role acting (physician, patient, lab)
# + userId - who is acting, for the audit trail
# + return - an error if the task is not open or the role may not complete it
isolated function completeTask(string taskId, anydata result, string role, string userId) returns error? {
    return mgmt:completeHumanTask(taskId, result, [role], userId);
}

# Decides an open review: retry the failed step, or stop the assessment.
#
# + taskId - the review task
# + rerun - true to run the step again, false to stop
# + userId - who decided, for the audit trail
# + return - an error if the review is not open
isolated function decideReview(string taskId, boolean rerun, string userId) returns error? {
    return mgmt:completeReviewActivity(taskId, {action: rerun ? "proceed" : "reject",
        feedback: rerun ? "Retry once the system is back" : "Stopped by operations"}, ["operations"], userId);
}
