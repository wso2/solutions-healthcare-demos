import ballerina/ai;
import ballerina/http;
import ballerina/log;
import ballerinax/ai.memory.postgresql as aimemory;

// Three agents, one per point in the journey where clinical reasoning happens:
//
//   Diagnostic Copilot   records the physician selected  →  overview, evaluation, lab panel  →  physician orders
//   Results Analysis     lab results arrive               →  risk analysis   ┐ run back to back, unattended,
//   Care Plan            the analysis                     →  note + report   ┘ then the physician reviews
//
// Analysis and Care Plan stay separate agents although nothing sits between them: they write for
// different readers (a clinical interpretation vs. a patient-facing plan), the Care Plan agent has no
// EHR access at all — it may only use what the analysis established — and a Care Plan retry does not
// re-run the analysis.
//
// The Copilot runs on demand from the API (the physician is in a conversation with it); Analysis and
// Care Plan run inside Temporal activities, which give them retries, timeouts and crash recovery.
//
// EHR access: the Copilot and the Analyst also get the WSO2 FHIR MCP server's read tools for the
// patient's EHR, so they can look up anything the physician did not select — without a hand-written
// tool per question. Writes are not exposed: an EHR is only changed by workflow activities.
//
// Memory is Postgres-backed and keyed per assessment and agent, so the Copilot conversation survives
// restarts and spans days.

final aimemory:ShortTermMemoryStore agentMemoryStore = check new (db, maxMessagesPerKey = agentMemoryMaxMessages,
    tableName = "agent_messages", checkpointTableName = "agent_checkpoints");

final ai:ShortTermMemory agentMemory = check new (agentMemoryStore);

isolated function copilotSession(string assessmentId) returns string => assessmentId + ":copilot";

isolated function analysisSession(string assessmentId) returns string => assessmentId + ":analysis";

isolated function carePlanSession(string assessmentId) returns string => assessmentId + ":care-plan";

final string CLINICAL_GUARDRAILS = string `
## Ground rules
- You support a licensed physician. You never make the final decision; the physician reviews everything you produce.
- Use only the data you are given or retrieve with your tools. Never invent results, dates, history or values.
- When evidence is thin, say so and lower your confidence rather than guessing.
- Be concise and clinically precise. Cite actual values with units and dates.
- Check allergies and current medications against anything you suggest; call out interactions and cross-reactivity.
- Test codes must come from the lab catalog (get_lab_catalog). Never invent a test code.`;

final string EHR_ACCESS = string `
## EHR access
You can query the patient's EHR directly with the FHIR tools "search" and "read" (read-only). Use them only
for context you were not given — for example an encounter's reason, a medication's history, or a resource
type the selection leaves out. Always filter by the patient (patient=Patient/<id>) and keep searches narrow
(code, category, date, _count). Do not re-fetch what you were already given.`;

final string LITERATURE = string `
## Literature
You can search PubMed with "search_pubmed" (and read a study's abstract with "get_abstract") when a
recommendation, threshold or risk statement benefits from evidence. Search with clinical terms only — never
the patient's name, identifiers or dates. Prefer recent reviews and guidelines (reviewsOnly, sinceYear). Cite
what you used as [PMID 12345678] next to the statement it supports; never cite an article you did not retrieve.
Use at most two searches.`;

final string COPILOT_INSTRUCTIONS = string `You help a preventive medicine physician evaluate a patient and decide which biomarkers to measure.

You receive the patient's context (problems, allergies, current medications, family history, vitals, rule-based flags and care gaps), the EHR records the physician selected in the data explorer (encounters, problems, medications, lab results, vitals, notes…) with the date range they looked at, and the physician's question.

## What to do
1. Read the selected records closely — including clinical notes — and the patient context. Answer the physician's question first, in "reply" (one to three sentences).
2. Write "overview": what the selected records show, as Markdown (100-180 words). Lead with what matters most; mention trends with values and dates.
3. List "keyFindings": the findings that matter, each with significance and the evidence (values, dates, note quotes).
4. Form 2-4 risk hypotheses (cardiovascular, metabolic, renal, hepatic, inflammatory, endocrine, nutritional, medication safety...). Each needs a likelihood and a rationale grounded in specific values.
5. Call get_lab_catalog and recommend a focused panel. Every test needs a rationale tied to a hypothesis or care gap:
   - "essential": directly tests a moderate/high hypothesis or closes a baseline care gap with clinical relevance.
   - "recommended": refines risk or establishes a useful baseline.
   - "optional": nice to have.
   Prefer fewer, high-yield tests. Do not re-order a test whose recent result already answers the question.
6. Suggest 2-4 questions for the patient that would change the plan.

When the physician replies or asks a follow-up, answer it in "reply", revise the rest only where it changes, and say what changed in "reasoningNote".`;

final string ANALYST_INSTRUCTIONS = string `You interpret a patient's new lab results for a preventive medicine physician, in the context of their EHR history.

You receive the patient's EHR summary, the physician's reason for the order and the Copilot's evaluation, the tests ordered, and the new results from the lab (with the lab's reference ranges).

## What to do
1. For every new result, classify it:
   - "optimal": meets the clinic's target (get_lab_catalog lists targets per analyte).
   - "normal": inside the lab reference range but not at target.
   - "borderline": at the edge of the reference range or clearly trending the wrong way.
   - "out-of-range": outside the lab reference range.
2. Set each result's trend from the history already in the summary (biomarkers[].points): "new" if the analyte has no history, otherwise rising/falling/stable. get_biomarker_history is only for an analyte missing from the summary.
3. Derive what the combination means. Compute HOMA-IR when fasting glucose (mg/dL) and fasting insulin (uIU/mL) are both present: glucose × insulin ÷ 405 (> 2.0 suggests insulin resistance). Consider ApoB and Lp(a) together with family history, hs-CRP as a risk enhancer, cystatin C with eGFR for kidney function, and medications (e.g. NSAIDs, thiazides) that explain a result.
4. Raise risk flags (severity low/moderate/high) for patterns that matter, each with the specific values as evidence.
5. Write updatedSummary: a physician-facing Markdown summary (120-200 words) that merges the history with today's results. Lead with the most important finding. No title or heading line — the portal shows it under its own header.
6. List concrete next steps the physician may consider (further tests, referrals, lifestyle or pharmacological options to discuss). These are suggestions for the physician, not orders.
Keep it compact (biomarker interpretations one or two sentences each) and always return every field, ending with suggestedNextSteps.`;

final string CARE_PLAN_INSTRUCTIONS = string `You draft a care plan, a chart note and a patient report from a results analysis. The physician reviews and releases your draft before the patient sees anything.

You receive the results analysis, the physician's reason for the order, and the patient's current medications and allergies. Use only what the analysis established; do not add findings of your own.

## What to produce
1. physicianNote: a Markdown chart note with sections "Assessment", "Plan" and "Follow-up", under 350 words. Reference key values with units. Mark medication changes as "to discuss" — the physician decides.
2. goals: 3-5 measurable goals (e.g. "ApoB below 80 mg/dL", "150 min/week zone-2 cardio") with a timeframe and category.
3. followUpLabs: which catalog tests to repeat and when (testCode from get_lab_catalog, timing such as "in 3 months").
4. patientReport, written for the patient:
   - Plain language at about an 8th-grade reading level. Explain terms ("ApoB — the number of cholesterol-carrying particles").
   - Warm, honest and specific. No alarmism, no false reassurance.
   - keyResults: the 4-6 results that matter most. "value" is only the number and unit (e.g. "128 mg/dL"); put the
     target and meaning in "explanation" (one or two sentences). Status is good/watch/act.
   - yourPlan: 3-5 concrete items, lifestyle-first. Never start, stop or change a medication in the patient report;
     say "your doctor will talk with you about…" instead.
   - nextSteps: what happens next and when.
Keep the whole answer compact: it must be one valid JSON object, so avoid tables and unescaped quotes in text.`;

# Agent roles. ballerina/ai records the role as `gen_ai.agent.name` on every span of an agent's run,
# which is how infra/trace-router files each trace under the right agent in Agent Manager.
const COPILOT_ROLE = "Longevity Diagnostic Copilot";
const ANALYST_ROLE = "Longevity Lab Results Analyst";
const CARE_PLANNER_ROLE = "Longevity Care Plan Writer";

# Copilot and Analyst instances per EHR: each has its EHR's FHIR MCP server as tools.
isolated map<ai:Agent> copilots = {};
isolated map<ai:Agent> analysts = {};

final readonly & boolean agentsReady = check createEhrAgents();

function createEhrAgents() returns boolean|error {
    foreach EhrSystemConfig ehr in ehrSystems {
        ai:Agent copilot = check new (
            systemPrompt = {role: COPILOT_ROLE, instructions: COPILOT_INSTRUCTIONS + EHR_ACCESS + LITERATURE + CLINICAL_GUARDRAILS},
            model = copilotModel,
            tools = [getLabCatalog, getBiomarkerHistory, ...connectEhrMcp(ehr, agentManager.copilot),
                ...connectPubmedMcp(agentManager.copilot)],
            memory = agentMemory,
            maxIter = agentMaxIter,
            verbose = agentVerbose
        );
        ai:Agent analyst = check new (
            systemPrompt = {role: ANALYST_ROLE, instructions: ANALYST_INSTRUCTIONS + EHR_ACCESS + LITERATURE + CLINICAL_GUARDRAILS},
            model = analystModel,
            tools = [getLabCatalog, getBiomarkerHistory, ...connectEhrMcp(ehr, agentManager.analyst),
                ...connectPubmedMcp(agentManager.analyst)],
            memory = agentMemory,
            maxIter = agentMaxIter,
            verbose = agentVerbose
        );
        lock {
            copilots[ehr.id] = copilot;
        }
        lock {
            analysts[ehr.id] = analyst;
        }
    }
    // No EHR tools: the Care Plan agent may only use what the analysis established, plus the literature.
    ai:Agent carePlanner = check new (
        systemPrompt = {role: CARE_PLANNER_ROLE, instructions: CARE_PLAN_INSTRUCTIONS + LITERATURE + CLINICAL_GUARDRAILS},
        model = carePlanModel,
        tools = [getLabCatalog, ...connectPubmedMcp(agentManager.carePlanner)],
        memory = agentMemory,
        maxIter = agentMaxIter,
        verbose = agentVerbose
    );
    lock {
        carePlanners["default"] = carePlanner;
    }
    return true;
}

# Connects an agent to an EHR's FHIR MCP server, read tools only.
#
# + ehr - the EHR
# + agent - what Agent Manager issued to the agent
# + return - the connected MCP toolkit, or an empty list when the server is unreachable
function connectEhrMcp(EhrSystemConfig ehr, ManagedAgentConfig agent) returns ai:McpToolKit[] =>
    connectMcp(ehr.id, "FHIR MCP server", ehr.mcpServerUrl, ehrMcpPermittedTools, agent);

# Connects an agent to the PubMed MCP server (literature search).
#
# + agent - what Agent Manager issued to the agent
# + return - the connected MCP toolkit, or an empty list when the server is unreachable or not configured
function connectPubmedMcp(ManagedAgentConfig agent) returns ai:McpToolKit[] =>
    pubmedMcpUrl == "" ? [] : connectMcp("pubmed", "PubMed MCP server", pubmedMcpUrl, (), agent);

# Connects an agent to an MCP server. Under Agent Manager the agent goes through the MCP proxy in front of
# it and authenticates with its own AgentID (client credentials, with the proxy as the token's resource),
# so the proxy allows only the tools the agent's roles grant — a tool outside them is refused by the
# gateway, and an agent with no grant on the proxy gets no token at all. Otherwise it talks to the server
# directly. If the server is unreachable the agent still runs, with its other tools (the same
# degradation the PA platform agents use).
#
# + target - the proxy key in `agentManager.mcpProxyUrls` (an EHR id, or `pubmed`)
# + label - what the server is, for the log
# + directUrl - the server's own URL, used without Agent Manager
# + permittedTools - tools the agent may see (nil for all the server offers)
# + agent - what Agent Manager issued to the agent
# + return - the connected MCP toolkit, or an empty list when the server is unreachable or refuses the agent
function connectMcp(string target, string label, string directUrl, string[]? permittedTools,
        ManagedAgentConfig agent) returns ai:McpToolKit[] {
    string? proxyUrl = agentManager.mcpProxyUrls[target];
    ai:McpToolKit|error toolkit;
    string url;
    if usesMcpProxy(agent) && proxyUrl is string {
        url = proxyUrl;
        string[] scopes = agent.mcpScopes[target] ?: [];
        if scopes.length() == 0 {
            log:printInfo(string `${label}: no Agent Manager grant for this agent; not connected`,
                    target = target, agent = agent.name, agentId = agent.clientId);
            return [];
        }
        toolkit = new (proxyUrl, permittedTools, auth = {
            tokenUrl: agentManager.tokenUrl,
            clientId: agent.clientId,
            clientSecret: agent.clientSecret,
            scopes,
            optionalParams: {"resource": proxyUrl}
        });
    } else {
        url = directUrl;
        toolkit = new (directUrl, permittedTools);
    }
    if toolkit is error {
        log:printWarn(string `${label} unreachable; agent will run without it`, toolkit,
                target = target, url = url, agent = agent.name);
        return [];
    }
    log:printInfo(string `${label} connected`, target = target, url = url, agent = agent.name,
            agentId = agent.clientId, tools = permittedTools ?: ["(all)"]);
    return [toolkit];
}

isolated function copilotFor(string ehr) returns ai:Agent|error {
    lock {
        ai:Agent? agent = copilots[ehr];
        if agent is ai:Agent {
            return agent;
        }
    }
    return error(string `No Copilot for EHR "${ehr}"`);
}

isolated function analystFor(string ehr) returns ai:Agent|error {
    lock {
        ai:Agent? agent = analysts[ehr];
        if agent is ai:Agent {
            return agent;
        }
    }
    return error(string `No Results Analysis agent for EHR "${ehr}"`);
}

// ── Care Plan (no EHR access) ──

# The Care Plan agent, created with the others (its literature tool is connected at start-up).
isolated map<ai:Agent> carePlanners = {};

isolated function carePlannerAgent() returns ai:Agent|error {
    lock {
        ai:Agent? agent = carePlanners["default"];
        if agent is ai:Agent {
            return agent;
        }
    }
    return error("The Care Plan agent is not initialized");
}

// ── Tools ──

# Lists what the clinic can order from the lab.
#
# + return - the orderable tests and, for every analyte, its LOINC code, unit and target
@ai:AgentTool {
    name: "get_lab_catalog",
    description: "Lists the tests the clinic can order from the lab (code, name, analytes, purpose, preparation) and, for every analyte, its LOINC code, unit and the clinic's target."
}
isolated function getLabCatalog() returns json {
    return {
        orderableTests: ORDERABLE_TESTS.toJson(),
        analytes: from Analyte analyte in ANALYTES
            select {code: analyte.code, name: analyte.name, unit: analyte.unit, longevityTarget: analyte.longevityTarget}
    };
}

# Every result an EHR holds for one analyte.
#
# + ehr - the EHR id given in the prompt
# + patientId - the patient's id in that EHR
# + loincCode - the analyte's LOINC code from get_lab_catalog
# + return - the results, oldest first, or an error if the EHR cannot be searched
@ai:AgentTool {
    name: "get_biomarker_history",
    description: "Returns every result the patient's EHR holds for one analyte, oldest first, with date, value, the lab's interpretation code (H/L/N) and the source system. Pass the EHR id and patient id given in the prompt, and the LOINC code from get_lab_catalog."
}
isolated function getBiomarkerHistory(string ehr, string patientId, string loincCode) returns json|error {
    BiomarkerPoint[] points = check ehrObservationHistory(ehr, patientId, loincCode);
    Analyte? analyte = analyteByCode(loincCode);
    return {
        loincCode,
        analyte: analyte is Analyte ? analyte.name : (),
        unit: analyte is Analyte ? analyte.unit : (),
        results: points.toJson(),
        note: points.length() == 0 ? "No results for this analyte in the EHR." : ()
    };
}

// ── Running the agents ──

# Asks the Copilot to evaluate the records the physician selected.
#
# + assessmentId - the assessment, which keys the Copilot's conversation memory
# + summary - the patient's summary, for context
# + request - the selected records, date range and question
# + return - the evaluation with only catalog tests kept, or an error if no model is configured or the agent fails
isolated function runCopilotEvaluation(string assessmentId, PatientSummary summary, EvaluationRequest request)
        returns CopilotEvaluation|error {
    check checkModelConfigured();
    ai:Agent copilot = check copilotFor(summary.patient.ehr);
    ExplorerRow[] records = request.records.length() > evaluationMaxRecords
        ? request.records.slice(0, evaluationMaxRecords) : request.records;
    string range = request.dateFrom is string || request.dateTo is string
        ? string `${request.dateFrom ?: "the beginning"} to ${request.dateTo ?: "today"}` : "all dates";
    string prompt = string `Evaluate these EHR records for the physician.

EHR (for tools): ${summary.patient.ehr} — ${summary.patient.ehrName}
Patient id (for tools): ${summary.patient.id}

## Physician's question
${request.question.trim().length() == 0 ? "Give an overview and evaluation of these records, and propose a lab panel." : request.question}

## Selected records (${records.length()} rows, ${range})
${compactRecords(records)}

## Patient context
${contextForPrompt(summary)}`;
    CopilotEvaluation evaluation = check copilot.run(prompt, copilotSession(assessmentId));
    return withCatalogTestsOnly(evaluation);
}

# A follow-up in the Copilot conversation: the physician's reply or question.
#
# + assessmentId - the assessment whose Copilot conversation continues
# + ehr - the patient's EHR, which picks the Copilot with that EHR's tools
# + message - the physician's message
# + return - the revised evaluation with only catalog tests kept, or an error if no model is configured or the agent fails
isolated function runCopilotFollowUp(string assessmentId, string ehr, string message) returns CopilotEvaluation|error {
    check checkModelConfigured();
    ai:Agent copilot = check copilotFor(ehr);
    string prompt = string `The physician replied:

"${message}"

Answer in "reply". Revise the evaluation and the panel only where this changes them, and say what changed in reasoningNote.`;
    CopilotEvaluation evaluation = check copilot.run(prompt, copilotSession(assessmentId));
    return withCatalogTestsOnly(evaluation);
}

# Asks the Results Analysis agent to interpret the new results.
#
# + assessmentId - the assessment, which keys the agent's memory
# + summary - the patient's summary
# + approval - the physician's order, with their reason for it
# + evaluation - the Copilot's evaluation the order came from, if there was one
# + results - the new results
# + return - the analysis, or an error if no model is configured or the agent fails
isolated function runResultsAnalysisAgent(string assessmentId, PatientSummary summary, LabOrderApproval approval,
        CopilotEvaluation? evaluation, LabResults results) returns ResultsAnalysis|error {
    check checkModelConfigured();
    ai:Agent analyst = check analystFor(summary.patient.ehr);
    string prompt = string `Analyse the new lab results for this patient.

EHR (for tools): ${summary.patient.ehr} — ${summary.patient.ehrName}
Patient id (for tools): ${summary.patient.id}

## Why the physician ordered these tests
Reason: ${approval.clinicalContext == "" ? "(not given)" : approval.clinicalContext}
Tests ordered: ${string:'join(", ", ...approval.approvedTests)}
Order note: ${approval.note == "" ? "(none)" : approval.note}
${evaluation is CopilotEvaluation ? "Copilot evaluation before the order:\n" + evaluation.overview : ""}

## New results from ${labDisplayName} (report ${results.diagnosticReportId}, issued ${results.issued})
${results.results.toJsonString()}

## EHR summary (history before today)
${summaryForPrompt(summary)}`;
    return analyst.run(prompt, analysisSession(assessmentId));
}

# Asks the Care Plan agent for the draft note and patient report.
#
# + assessmentId - the assessment, which keys the agent's memory
# + summary - the patient's summary (for medications and allergies)
# + approval - the physician's order, with their reason for it
# + analysis - the results analysis
# + return - the draft care plan with only catalog follow-up tests kept, or an error if the agent fails
isolated function runCarePlanAgent(string assessmentId, PatientSummary summary, LabOrderApproval approval,
        ResultsAnalysis analysis) returns CarePlanResult|error {
    check checkModelConfigured();
    string prompt = string `Draft the care plan for ${summary.patient.name} (${summary.patient.age ?: 0}, ${summary.patient.gender ?: "unknown"}).

## Why the physician ordered the tests
${approval.clinicalContext == "" ? "(not given)" : approval.clinicalContext}

## Results analysis
${analysis.toJsonString()}

## Current medications
${(from MedicationItem m in summary.medications where m.status == "active" select m).toJsonString()}

## Allergies
${summary.allergies.toJsonString()}`;
    ai:Agent carePlanner = check carePlannerAgent();
    CarePlanResult plan = check carePlanner.run(prompt, carePlanSession(assessmentId));
    plan.followUpLabs = from FollowUpTest test in plan.followUpLabs
        where orderableByCode(test.testCode) is OrderableTest
        select test;
    return plan;
}

# The summary as the agents see it: everything clinical, without the integration's own bookkeeping.
#
# + summary - the patient summary
# + return - the summary as a JSON string, without `fhirQueries`, `generatedAt` and `source`
isolated function summaryForPrompt(PatientSummary summary) returns string {
    map<json> view = <map<json>>summary.toJson();
    _ = view.removeIfHasKey("fhirQueries");
    _ = view.removeIfHasKey("generatedAt");
    _ = view.removeIfHasKey("source");
    _ = view.removeIfHasKey("vitalTrends");
    return view.toJsonString();
}

# The patient context the Copilot always gets, whatever the physician selected.
#
# + summary - the patient summary
# + return - problems, allergies, medications, family and social history, vitals, flags and care gaps as JSON
isolated function contextForPrompt(PatientSummary summary) returns string {
    return {
        patient: summary.patient.toJson(),
        activeProblems: (from ConditionItem c in summary.conditions where c.status == "active" select c).toJson(),
        allergies: summary.allergies.toJson(),
        medications: summary.medications.toJson(),
        familyHistory: summary.familyHistory.toJson(),
        socialHistory: summary.socialHistory.toJson(),
        latestVitals: summary.vitals.toJson(),
        flags: summary.flags.toJson(),
        careGaps: summary.careGaps.toJson()
    }.toJsonString();
}

# The selected rows as compact lines for the prompt; notes keep their full text.
#
# + records - the rows
# + return - one line per row (notes followed by their text)
isolated function compactRecords(ExplorerRow[] records) returns string {
    string[] lines = [];
    foreach ExplorerRow row in records {
        string line = string `- [${row.kind}] ${row.date is string ? (<string>row.date).substring(0, 10) : "undated"} — ${row.title}`;
        if row.value is string {
            line += string `: ${<string>row.value}${row.unit is string ? " " + <string>row.unit : ""}`;
        }
        if row.flag is string && row.flag != "N" {
            line += string ` (${<string>row.flag})`;
        }
        if row.detail is string && row.kind != "note" {
            line += string ` · ${<string>row.detail}`;
        }
        if row.status is string {
            line += string ` · ${<string>row.status}`;
        }
        string? text = row.text;
        if text is string {
            line += string `${"\n"}  Note text: ${re `\n`.replaceAll(text, "\n  ")}`;
        }
        lines.push(line);
    }
    return string:'join("\n", ...lines);
}

# Drops any recommended test the lab cannot run. The model is told to use catalog codes; this is
# what guarantees it, so an invented code can never reach the order.
#
# + evaluation - the Copilot's evaluation
# + return - a copy without tests that are not in the lab catalog
isolated function withCatalogTestsOnly(CopilotEvaluation evaluation) returns CopilotEvaluation {
    CopilotEvaluation checked = evaluation.clone();
    checked.recommendedTests = from RecommendedTest test in evaluation.recommendedTests
        where orderableByCode(test.testCode) is OrderableTest
        select test;
    return checked;
}

# An agent failure small enough for Temporal to record. `ai:Agent` errors carry every step of the run
# in their detail; returned from an activity as is, Temporal rejects the failure ("exceeds size limit")
# and the real reason is lost. The full error is logged here; the activity returns the short form.
#
# + agentName - which agent failed, for the log
# + err - the agent's error
# + return - an error with a short, self-contained message
isolated function compactAgentError(string agentName, error err) returns error {
    log:printError(string `${agentName} failed`, err);
    string reason = err.message();
    string? gateway = gatewayReply(err);
    var steps = err.detail()["steps"];
    if steps is (ai:ExecutionResult|ai:ExecutionError|ai:Error)[] && steps.length() > 0 {
        ai:ExecutionResult|ai:ExecutionError|ai:Error last = steps[steps.length() - 1];
        if last is ai:Error {
            reason += ": " + last.message();
            gateway = gateway ?: gatewayReply(last);
        } else if last is ai:ExecutionError {
            reason += ": " + last.'error.message();
            gateway = gateway ?: gatewayReply(last.'error);
        }
    }
    if gateway is string {
        reason += " · " + gateway;
    }
    return error(reason.length() > 1000 ? reason.substring(0, 1000) : reason);
}

# The HTTP reply behind a failed model call, as "AI gateway HTTP 429: <body>", from the error's cause
# chain. The model provider reports any non-2xx as "Unexpected response format"; the status is what tells
# a budget refusal (429) from a permission refusal (401/403) or a timeout (503/504), and the portal
# explains each.
#
# + err - an agent or model-provider error
# + return - the status and the start of the reply body, or () when no HTTP reply is in the chain
isolated function gatewayReply(error err) returns string? {
    error? current = err;
    while current is error {
        if current is http:ApplicationResponseError {
            var detail = current.detail();
            anydata body = detail.body;
            string text = body is string ? body : body.toString();
            text = re `\s+`.replaceAll(text, " ").trim();
            return string `AI gateway HTTP ${detail.statusCode}: ${text.length() > 200 ? text.substring(0, 200) : text}`;
        }
        current = current.cause();
    }
    return ();
}
