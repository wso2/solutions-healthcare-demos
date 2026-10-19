// Types shared by the workflow, activities, agents and API.
// FHIR resources themselves use ballerinax/health.fhir.r4 (`r4`) and `international401`; these are
// the integration's own shapes — what the portal renders and what agents read and return.

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

// ── Patients ──

# A patient as listed in search results and page headers.
#
# + ehr - the EHR the patient's record lives in
# + ehrName - that EHR's display name
# + id - the patient's id in that EHR
# + name - display name
# + gender - administrative gender
# + birthDate - birth date
# + age - age in years today
# + mrn - medical record number in that EHR
# + city - home city
# + phone - contact phone, for the patient notification
type PatientCard record {|
    string ehr;
    string ehrName;
    string id;
    string name;
    string? gender;
    string? birthDate;
    int? age;
    string? mrn;
    string? city;
    string? phone = ();
|};

// ── Patient summary (deterministic — built from FHIR, no LLM) ──
// The sections follow the International Patient Summary (IPS): problems, allergies, medications,
// immunizations, results, vital signs, procedures and social history, plus family history and the
// clinic's own trend flags and care gaps.

# A problem-list entry.
#
# + display - the condition
# + code - ICD-10 code when present, otherwise SNOMED CT
# + onset - onset date
# + abatement - date it resolved, if it has
# + status - clinical status (active, resolved…)
type ConditionItem record {|
    string display;
    string? code;
    string? onset;
    string? abatement = ();
    string? status;
|};

# A medication, prescribed or reported by the patient.
#
# + display - the medication and strength
# + status - active, completed, stopped…
# + since - when it was started or prescribed
# + until - when it ended, if it has
# + dosage - dosage instructions
# + source - `prescribed` (MedicationRequest) or `patient-reported` (MedicationStatement, e.g. over the counter)
type MedicationItem record {|
    string display;
    string? status;
    string? since;
    string? until = ();
    string? dosage;
    "prescribed"|"patient-reported" 'source = "prescribed";
|};

# An allergy or intolerance.
#
# + substance - what the patient reacts to
# + category - medication, food, environment or biologic
# + criticality - low, high or unable-to-assess
# + reactions - the recorded manifestations
# + severity - the most severe recorded reaction severity
# + recorded - when it was recorded
type AllergyItem record {|
    string substance;
    string? category;
    string? criticality;
    string[] reactions;
    string? severity;
    string? recorded;
|};

# A vaccine given.
#
# + vaccine - the vaccine
# + date - when it was given
# + status - completed, not-done…
type ImmunizationItem record {|
    string vaccine;
    string? date;
    string? status;
|};

# A past procedure.
#
# + display - the procedure
# + date - when it was performed
# + status - completed, in-progress…
type ProcedureItem record {|
    string display;
    string? date;
    string? status;
|};

# A social-history finding, such as smoking status.
#
# + label - what was observed
# + value - the finding
# + date - when it was recorded
type SocialHistoryItem record {|
    string label;
    string value;
    string? date;
|};

# A relative's condition.
#
# + relationship - who (father, mother…)
# + condition - their condition
# + onsetAge - their age at onset
type FamilyHistoryItem record {|
    string relationship;
    string condition;
    int? onsetAge;
|};

# A visit.
#
# + id - the Encounter id
# + date - visit date
# + type - kind of visit
# + reason - reason for the visit
# + status - finished, in-progress…
# + provider - the organization that provided it
type EncounterItem record {|
    string id;
    string? date;
    string 'type;
    string? reason;
    string? status;
    string? provider = ();
|};

# The latest vital signs.
#
# + systolic - systolic blood pressure (mmHg)
# + diastolic - diastolic blood pressure (mmHg)
# + bloodPressureDate - date of that blood pressure
# + heartRate - heart rate (/min)
# + respiratoryRate - respiratory rate (/min)
# + temperature - body temperature (°C)
# + bmi - body mass index
# + weightKg - body weight (kg)
# + heightCm - body height (cm)
type VitalSigns record {|
    decimal? systolic = ();
    decimal? diastolic = ();
    string? bloodPressureDate = ();
    decimal? heartRate = ();
    decimal? respiratoryRate = ();
    decimal? temperature = ();
    decimal? bmi = ();
    decimal? weightKg = ();
    decimal? heightCm = ();
|};

# One reading of a vital sign; blood pressure carries both values.
#
# + date - when it was measured
# + value - the value (systolic for blood pressure)
# + value2 - diastolic, for blood pressure
type VitalPoint record {|
    string date;
    decimal value;
    decimal? value2 = ();
|};

# A vital sign over time, for the summary's trend charts.
#
# + code - LOINC code
# + name - display name
# + unit - unit
# + points - readings, oldest first
type VitalTrend record {|
    string code;
    string name;
    string unit;
    VitalPoint[] points;
|};

# One lab result in an analyte's history.
#
# + date - when the sample was taken
# + value - the result
# + interpretation - the lab's flag (H, L, N)
# + source - the system the result came from
type BiomarkerPoint record {|
    string date;
    decimal value;
    string? interpretation;
    string 'source;
|};

# One analyte's history, oldest first, with the deterministic trend read from it.
#
# + code - LOINC code (the clinic's catalog code when the EHR used an equivalent one)
# + name - display name
# + unit - unit of the latest result
# + points - every result, oldest first
# + latest - the most recent value
# + latestDate - date of the most recent value
# + previous - the value before the latest, or nil with a single result
# + changePct - change from the first to the latest value in percent, or nil with a single result
# + trend - direction of that change; `single` when there is only one result
# + status - the latest value against the lab's reference range
# + referenceLow - lower bound of the lab's reference range on the latest result
# + referenceHigh - upper bound of the lab's reference range on the latest result
# + longevityTarget - the clinic's target, for analytes in the catalog
type BiomarkerSeries record {|
    string code;
    string name;
    string unit;
    BiomarkerPoint[] points;
    decimal latest;
    string latestDate;
    decimal? previous;
    decimal? changePct;
    "rising"|"falling"|"stable"|"single" trend;
    "normal"|"high"|"low" status;
    decimal? referenceLow;
    decimal? referenceHigh;
    string? longevityTarget;
|};

# A rule-based finding in the summary.
#
# + severity - info, watch or concern
# + title - the finding
# + detail - the values behind it
# + codes - LOINC codes it is about
type SummaryFlag record {|
    "info"|"watch"|"concern" severity;
    string title;
    string detail;
    string[] codes = [];
|};

# A longevity-baseline test the patient has never had.
#
# + title - what is missing
# + detail - why it matters
# + suggestedTests - catalog tests that would close the gap
type CareGap record {|
    string title;
    string detail;
    string[] suggestedTests;
|};

# The patient summary: the IPS sections plus the clinic's deterministic flags and care gaps.
#
# + patient - who it is about
# + source - `summary-operation` when the EHR answered Patient/$summary, `composed-search` otherwise
# + fhirQueries - the FHIR requests that produced it
# + conditions - problem list
# + allergies - allergies and intolerances
# + medications - prescribed and patient-reported medications, current and past
# + immunizations - vaccines given
# + procedures - recent procedures
# + socialHistory - smoking status and similar findings
# + familyHistory - relatives' conditions
# + encounters - recent visits
# + vitals - the latest vital signs
# + vitalTrends - blood pressure, weight, BMI and heart rate over time
# + biomarkers - lab analytes over the lookback window
# + flags - rule-based findings
# + careGaps - longevity-baseline tests never done
# + generatedAt - when it was built
type PatientSummary record {|
    PatientCard patient;
    string 'source;
    string[] fhirQueries;
    ConditionItem[] conditions;
    AllergyItem[] allergies;
    MedicationItem[] medications;
    ImmunizationItem[] immunizations;
    ProcedureItem[] procedures;
    SocialHistoryItem[] socialHistory;
    FamilyHistoryItem[] familyHistory;
    EncounterItem[] encounters;
    VitalSigns vitals;
    VitalTrend[] vitalTrends;
    BiomarkerSeries[] biomarkers;
    SummaryFlag[] flags;
    CareGap[] careGaps;
    string generatedAt;
|};

// ── EHR data explorer ──

# One row of the explorer: any clinical resource, normalised so the portal can show every kind in one
# filterable table and the physician can hand a selection to the Copilot.
#
# + ref - the resource reference, e.g. `Observation/abc`
# + kind - encounter, problem, medication, lab, vital, immunization, allergy, procedure, note, report or social
# + date - the clinically relevant date
# + title - what it is
# + detail - one line of context (reason, dosage, reactions, note excerpt…)
# + value - numeric or coded result, for labs and vitals
# + unit - unit of `value`
# + flag - the lab's interpretation (H, L, N) or an allergy's criticality
# + status - the resource's status
# + code - its primary code
# + text - the full text of a clinical note
type ExplorerRow record {|
    string ref;
    string kind;
    string? date;
    string title;
    string? detail = ();
    string? value = ();
    string? unit = ();
    string? flag = ();
    string? status = ();
    string? code = ();
    string? text = ();
|};

# What the explorer fetched.
#
# + ehr - the EHR it came from
# + patientId - the patient
# + rows - the records, newest first
# + counts - rows per kind
# + queries - the FHIR searches that were run
# + fetchedAt - when
# + durationMs - how long the EHR took
type ExplorerResult record {|
    string ehr;
    string patientId;
    ExplorerRow[] rows;
    map<int> counts;
    string[] queries;
    string fetchedAt;
    int durationMs;
|};

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
# + records - the explorer rows they selected
# + dateFrom - start of the date range they looked at
# + dateTo - end of that range
# + question - what they want evaluated; blank asks for a general evaluation
type EvaluationRequest record {|
    ExplorerRow[] records;
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

# The patient's lab visit: the result of the "lab visit" human task, completed by the lab when it
# collects the specimen.
#
# + specimenId - the lab's Specimen id
# + collectedAt - when the specimen was collected
# + collectedBy - who completed the task
type LabVisit record {|
    string specimenId;
    string collectedAt;
    string collectedBy = "lab";
|};

# The physician's release: the result of the "review and release" human task.
#
# + comment - the physician's comment, added to the chart note and the patient's report
type PhysicianRelease record {|
    string comment = "";
|};

# Notice from the lab that its report is ready (a system event, not a person). It carries the lab's FHIR
# resources — as the lab sent them in its message, or as the fallback poller read them from the lab — so the
# results step works from exactly what the lab reported. They were read as FHIR R4 types when they arrived
# and are read as such again in the results step; in between they travel as FHIR JSON, because the workflow
# compiler describes every type that crosses the workflow boundary and FHIR's recursive types are too large
# to describe.
#
# + serviceRequestId - the lab's order
# + diagnosticReportId - the lab's report
# + status - the report's status
# + via - which path noticed it (lab webhook or fallback poll)
# + report - the lab's DiagnosticReport, as FHIR JSON
# + observations - the Observations the report references, as FHIR JSON
type LabResultNotice record {|
    string serviceRequestId;
    string diagnosticReportId;
    string status;
    string via;
    json report;
    json[] observations;
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

// ── Lab exchange ──

# The order as placed in both systems.
#
# + labPatientId - the patient's id in the lab
# + labServiceRequestId - the lab's order
# + ehrServiceRequestId - the EHR's order of record
# + placerOrderId - the clinic's order id, the same in both
# + tests - catalog codes ordered
type LabOrderPlaced record {|
    string labPatientId;
    string labServiceRequestId;
    string ehrServiceRequestId;
    string placerOrderId;
    string[] tests;
|};

# What the patient was told to do.
#
# + communicationId - the FHIR Communication filed in the EHR
# + message - the message
# + instructions - preparation instructions for the ordered tests
# + labName - where to go
type PatientNotification record {|
    string communicationId;
    string message;
    string[] instructions;
    string labName;
|};

# One result from the lab.
#
# + code - LOINC code
# + name - analyte
# + value - result
# + unit - unit
# + interpretation - the lab's flag
# + referenceLow - lower bound of the lab's reference range
# + referenceHigh - upper bound of the lab's reference range
# + effectiveDate - when the sample was taken
type LabResultValue record {|
    string code;
    string name;
    decimal value;
    string unit;
    string? interpretation;
    decimal? referenceLow;
    decimal? referenceHigh;
    string effectiveDate;
|};

# The lab's report as filed in the EHR.
#
# + diagnosticReportId - the lab's report
# + ehrDiagnosticReportId - the copy filed in the EHR
# + status - the report's status
# + issued - when the lab issued it
# + results - the results
type LabResults record {|
    string diagnosticReportId;
    string ehrDiagnosticReportId;
    string status;
    string issued;
    LabResultValue[] results;
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
# + labResultReady - notice that the lab's report is ready
type AssessmentEvents record {|
    future<LabResultNotice> labResultReady;
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
