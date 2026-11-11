// Types shared by the workflow, activities, agents and API.
// Clinical data is FHIR R4 throughout: resources are `international401` records (and `r4:Bundle`) inside the
// integration, and FHIR JSON — produced by the library's serializers — wherever they leave it: in API responses,
// in the read model and through the workflow (whose compiler cannot describe FHIR's recursive record types, so
// activities hand resources to each other as FHIR JSON and parse them back with the library's parser). What is
// left here is the integration's own vocabulary: assessment lifecycle, physician requests, agent outputs and the
// workflow view.

// ── Assessment lifecycle ──

# Where an assessment is in the journey. Stored on the read model so the portal can render the
# stepper and the physician's board without asking Temporal. Each `AWAITING_*` stage names who the
# workflow is waiting on.
enum Stage {
    STARTING,
    BUILDING_SUMMARY,
    AWAITING_PHYSICIAN,
    PLACING_LAB_ORDER,
    AWAITING_PATIENT,
    AWAITING_LAB,
    ANALYZING_RESULTS,
    GENERATING_CARE_PLAN,
    AWAITING_REVIEW,
    COMPLETED,
    FAILED
}

# Who did something, for the integration timeline.
enum Actor {
    PHYSICIAN = "physician",
    PATIENT = "patient",
    WORKFLOW = "workflow",
    AGENT = "agent",
    EHR = "ehr",
    LAB = "lab",
    OPERATIONS = "operations"
}

// ── Copilot evaluation ──

# A finding the Copilot drew from the selected records.
#
# + finding - what it noticed
# + significance - how much it matters
# + evidence - the values, dates or notes behind it
type KeyFinding record {|
    string finding;
    "low"|"moderate"|"high" significance;
    string[] evidence;
|};

# A risk the Copilot suspects.
#
# + area - cardiovascular, metabolic, renal…
# + likelihood - how likely it judges it
# + rationale - why, with values
type RiskHypothesis record {|
    string area;
    "low"|"moderate"|"high" likelihood;
    string rationale;
|};

# A test the Copilot proposes.
#
# + testCode - catalog code
# + priority - essential, recommended or optional
# + rationale - why
type RecommendedTest record {|
    string testCode;
    "essential"|"recommended"|"optional" priority;
    string rationale;
|};

# Diagnostic Copilot output: an overview and evaluation of the records the physician selected, and the
# lab panel it proposes.
#
# + reply - a direct answer to the physician's latest message, in one to three sentences
# + overview - what the selected records show, as Markdown
# + keyFindings - the findings that matter, with evidence
# + riskHypotheses - risks it suspects, each with a likelihood and rationale
# + recommendedTests - the proposed lab panel
# + questionsForPatient - questions that would change the plan
# + reasoningNote - how it reached the proposal, and what changed in a revision
type CopilotEvaluation record {|
    string reply;
    string overview;
    KeyFinding[] keyFindings;
    RiskHypothesis[] riskHypotheses;
    RecommendedTest[] recommendedTests;
    string[] questionsForPatient;
    string reasoningNote;
|};

# What the physician hands the Copilot.
#
# + resources - the FHIR resources they selected in the explorer, as FHIR JSON
# + dateFrom - start of the date range they looked at
# + dateTo - end of that range
# + question - what they want evaluated; blank asks for a general evaluation
type EvaluationRequest record {|
    json[] resources;
    string? dateFrom = ();
    string? dateTo = ();
    string question = "";
|};

// ── Human tasks (the workflow waits on people) ──

# The physician's lab order: the result of the "order labs" human task.
#
# + approvedTests - catalog codes of the tests to order
# + note - note for the lab and the order of record
# + clinicalContext - the physician's reason for the order, which the later agents read
type LabOrderApproval record {|
    string[] approvedTests;
    string note = "";
    string clinicalContext = "";
|};

# The physician's release: the result of the "review and release" human task.
#
# + comment - the physician's comment, added to the chart note and the patient's report
type PhysicianRelease record {|
    string comment = "";
|};

// ── Agent outputs ──

# A pattern the Results Analysis agent flags.
#
# + area - the clinical area
# + severity - how much it matters
# + finding - the pattern
# + evidence - the values behind it
type RiskFlag record {|
    string area;
    "low"|"moderate"|"high" severity;
    string finding;
    string[] evidence;
|};

# The Results Analysis reading of one new result.
#
# + code - LOINC code
# + name - analyte
# + value - result
# + unit - unit
# + status - against the longevity target and the reference range
# + trend - against the patient's history
# + interpretation - what it means
type BiomarkerInsight record {|
    string code;
    string name;
    decimal value;
    string unit;
    "optimal"|"normal"|"borderline"|"out-of-range" status;
    "new"|"rising"|"falling"|"stable" trend;
    string interpretation;
|};

# Results Analysis output: what the new lab results mean against the patient's history.
#
# + headline - the most important finding in one line
# + updatedSummary - physician-facing Markdown summary merging history with today's results
# + riskFlags - patterns that matter, with the values as evidence
# + biomarkerInsights - status and trend of each new result
# + suggestedNextSteps - options for the physician to consider, not orders
type ResultsAnalysis record {|
    string headline;
    string updatedSummary;
    RiskFlag[] riskFlags;
    BiomarkerInsight[] biomarkerInsights;
    // Optional: a long analysis occasionally omits its last list, which must not fail the whole run.
    string[] suggestedNextSteps?;
|};

# A care-plan goal.
#
# + title - the goal
# + target - the measurable target
# + timeframe - by when
# + category - a free label (nutrition, activity, sleep, medication, monitoring...). Kept open on purpose: a
# closed enum here failed the whole care plan when the model wrote "exercise".
type CarePlanGoal record {|
    string title;
    string target;
    string timeframe;
    string category;
|};

# A test to repeat.
#
# + testCode - catalog code
# + timing - when, e.g. "in 3 months"
type FollowUpTest record {|
    string testCode;
    string timing;
|};

# A result explained for the patient.
#
# + name - the analyte, in plain words
# + value - number and unit only
# + status - good, watch or act
# + explanation - what it means and the target
type PatientKeyResult record {|
    string name;
    string value;
    "good"|"watch"|"act" status;
    string explanation;
|};

# One item of the patient's plan.
#
# + title - the item
# + detail - what to do
type PatientPlanItem record {|
    string title;
    string detail;
|};

# The plain-language report for the patient.
#
# + headline - the main message
# + whatWeFound - what the results show
# + keyResults - the results that matter most
# + yourPlan - the plan
# + nextSteps - what happens next
# + closingNote - a closing line
type PatientReport record {|
    string headline;
    string whatWeFound;
    PatientKeyResult[] keyResults;
    PatientPlanItem[] yourPlan;
    string[] nextSteps;
    string closingNote;
|};

# Care Plan output: the draft chart note and the patient-facing report, for the physician to review.
#
# + physicianNote - the Markdown chart note
# + goals - measurable goals with timeframes
# + followUpLabs - catalog tests to repeat, and when
# + patientReport - the plain-language report for the patient
type CarePlanResult record {|
    string physicianNote;
    CarePlanGoal[] goals;
    FollowUpTest[] followUpLabs;
    PatientReport patientReport;
|};

// ── Workflow ──

# What the workflow starts with.
#
# + assessmentId - the assessment, also the workflow id
# + ehr - the EHR the patient's record lives in; every write goes back there
# + patientId - the patient's id in that EHR
# + practitionerId - the physician
type AssessmentInput record {|
    string assessmentId;
    string ehr;
    string patientId;
    string practitionerId;
|};

# System events the workflow waits on. Each is delivered once: the first `sendData` for a name
# completes it, later ones are ignored — which is what lets both the lab webhook and the fallback
# poller signal `labResultReady` safely. Waits on people are human tasks instead (see workflow.bal).
#
# + labResultReady - the lab's final report and its Observations, as a FHIR `collection` Bundle (FHIR JSON)
# tagged with the path that noticed it (lab_results_intake.bal)
type AssessmentEvents record {|
    future<json> labResultReady;
|};

# How the workflow ended.
#
# + assessmentId - the assessment
# + status - completed
# + clinicalNoteId - the chart note filed in the EHR
type AssessmentOutcome record {|
    string assessmentId;
    string status;
    string? clinicalNoteId;
|};

// ── Workflow view (what the portal's Workflow switch shows) ──

# One step of the assessment workflow, as the portal draws it.
#
# + key - the step's id in the workflow definition
# + label - what it does
# + kind - activity (system), agent (AI), human (a person's task), event (a system notification) or review
# (a person deciding after automatic retries ran out)
# + actor - who acts: system, ai, physician, patient, lab or operations
# + state - pending, running, retrying, waiting, attention, done or failed
# + startedAt - when it started
# + endedAt - when it ended
# + attempts - attempts made so far
# + failure - the last failure, while retrying or failed
# + detail - one line about what it did or is waiting for
# + taskId - the open human task or review, so the portal can act on it
type WorkflowStepView record {|
    string key;
    string label;
    "activity"|"agent"|"human"|"event"|"review" kind;
    string actor;
    "pending"|"running"|"retrying"|"waiting"|"attention"|"done"|"failed" state;
    string? startedAt = ();
    string? endedAt = ();
    int attempts = 0;
    string? failure = ();
    string? detail = ();
    string? taskId = ();
|};

# One entry in the workflow's execution history, from ballerina/workflow's activity tree.
#
# + id - node id
# + name - activity, task or event name
# + label - display name
# + type - ACTIVITY, HUMAN_TASK, REVIEW_ACTIVITY, DATA, TIMER or CHILD_WORKFLOW
# + status - RUNNING, WAITING, COMPLETED, FAILED…
# + startTime - when it started
# + endTime - when it ended
# + attempt - Temporal attempt number
# + failure - failure message, if it failed
type WorkflowNodeView record {|
    string id;
    string name;
    string label;
    string 'type;
    string status;
    string? startTime;
    string? endTime;
    int attempt;
    string? failure;
|};

# The live view of an assessment's workflow.
#
# + workflowId - the Temporal workflow id
# + status - RUNNING, COMPLETED, FAILED…
# + temporalUrl - the run in the Temporal UI
# + steps - the workflow definition's steps with their live state
# + history - the execution history, oldest first
type WorkflowView record {|
    string workflowId;
    string status;
    string temporalUrl;
    WorkflowStepView[] steps;
    WorkflowNodeView[] history;
|};
