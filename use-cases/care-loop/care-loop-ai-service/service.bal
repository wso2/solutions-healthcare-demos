import ballerina/ai;
import ballerina/http;
import ballerina/lang.value;
import ballerina/log;
// OTLP gRPC span exporter (despite the name); activated via [ballerina.observe] config.
import ballerinax/jaeger as _;

import care_loop/care_loop_common as common;

// All three MCP servers (FHIR, knowledge, PubMed) are hard startup dependencies: the docker compose stack starts them together with healthchecks + depends_on, so `check` here fails fast on a genuinely broken toolkit rather than the service booting into a half-grounded state.
//
// httpVersion is pinned to 1.1: the client defaults to HTTP/2, which over cleartext sends an h2c upgrade the Python-based MCP servers (uvicorn) mishandle, dropping the request body and returning 400 on initialize.
final ai:McpToolKit fhirToolkit = check createFhirToolkit();
final ai:McpToolKit knowledgeToolkit = check new (knowledgeMcpUrl, httpVersion = http:HTTP_1_1);
final ai:McpToolKit pubmedToolkit = check new (pubmedMcpUrl, httpVersion = http:HTTP_1_1);

final ai:ModelProvider nanoModelProvider = check createModelProvider(nanoModel);
final ai:ModelProvider fullModelProvider = check createModelProvider(fullModel);

isolated function createFhirToolkit() returns ai:McpToolKit|ai:Error {
    // Empty token means the MCP server is reached directly, without gateway auth.
    http:BearerTokenConfig? mcpAuth = fhirMcpAuthToken == "" ? () : {token: fhirMcpAuthToken};
    return new (fhirMcpUrl, auth = mcpAuth, httpVersion = http:HTTP_1_1);
}

// Both providers use AmpModelProvider through the AMP gateway (see its header for the design); they differ only by serviceUrl (route) and modelName (gpt-* or claude-*).
isolated function createModelProvider(string modelName) returns ai:ModelProvider|ai:Error {
    // maxTokens is raised from the module default of 512, which truncates the risk agent's JSON answer; 8192 covers the longest observed answer.
    if modelProvider == "openai" {
        return new AmpModelProvider(openAiApiKey, modelName, serviceUrl = openAiServiceUrl, maxTokens = 8192);
    }
    if modelProvider == "anthropic" {
        return new AmpModelProvider(anthropicApiKey, modelName, serviceUrl = anthropicServiceUrl, maxTokens = 8192);
    }
    return error(string `unsupported modelProvider '${modelProvider}'; expected 'openai' or 'anthropic' (both routed through the AMP AI gateway)`);
}

final ai:Agent questionnaireAgent = check new (
    systemPrompt = {
        role: "Care Loop clinical assistant",
        instructions: questionnaireSystemPrompt
    },
    model = nanoModelProvider,
    tools = [fhirToolkit, knowledgeToolkit],
    verbose = true
);

// The interview agent gets only the knowledge toolkit: every patient fact it needs arrives prefilled in the turn request, so it never touches FHIR, keeping per-turn latency low.
final ai:Agent interviewAgent = check new (
    systemPrompt = {
        role: "Care Loop patient check-in assistant",
        instructions: interviewSystemPrompt
    },
    model = nanoModelProvider,
    tools = [knowledgeToolkit],
    verbose = true
);

final ai:Agent riskAssessmentAgent = check new (
    systemPrompt = {
        role: "Care Loop clinical assistant",
        instructions: riskAssessmentSystemPrompt
    },
    model = fullModelProvider,
    tools = [fhirToolkit, knowledgeToolkit, pubmedToolkit],
    // The default cap (tool count + 1) is too tight for this agent's FHIR/knowledge/PubMed research loop, which has been observed needing 15+ tool-call rounds before answering.
    maxIter = 32,
    verbose = true
);

final ai:Agent taskDescriptionAgent = check new (
    systemPrompt = {
        role: "Care Loop clinical documentation assistant",
        instructions: taskDescriptionSystemPrompt
    },
    model = nanoModelProvider,
    tools = [fhirToolkit],
    verbose = true
);

// Newer Claude snapshots (4.5-era) sometimes wrap the required JSON in a markdown code fence and/or prepend a sentence of reasoning before it, despite every prompt saying not to. Rather than rely on prompt wording alone, take the outermost {...} span so a fenced or prose-prefixed answer still parses.
isolated function extractJson(string raw) returns string {
    string trimmed = raw.trim();
    int? firstBrace = trimmed.indexOf("{");
    int? lastBrace = trimmed.lastIndexOf("}");
    if firstBrace is int && lastBrace is int && lastBrace >= firstBrace {
        return trimmed.substring(firstBrace, lastBrace + 1);
    }
    return trimmed;
}

// riskAssessmentAgent chains several sequential FHIR/knowledge/PubMed tool calls on the full model before answering; the default 60s listener idle timeout was cutting the HTTP/2 stream ("Stream timed out") out from under it before the response was ready, even after the caller's own client timeout (care-loop-analysis-service/clients.bal) was raised.
listener http:Listener sharedListener = new (listenPort, timeout = 240);

isolated function draftedItemCount(json questionnaire) returns int? {
    if questionnaire !is map<json> {
        return ();
    }
    json items = questionnaire["item"] ?: ();
    if items !is json[] {
        return ();
    }
    return items.length();
}

service /questionnaires on sharedListener {

    resource function post .(QuestionnaireRequest request) returns QuestionnaireResponse|http:InternalServerError {
        string query = string `Patient id: ${request.patientId}.`;

        string|ai:Error result = questionnaireAgent.run(query);
        if result is ai:Error {
            return <http:InternalServerError>{body: {message: "agent run failed: " + result.message()}};
        }

        json|error questionnaire = value:fromJsonString(extractJson(result));
        if questionnaire is error {
            return <http:InternalServerError>{body: {message: "agent did not return valid JSON: " + questionnaire.message()}};
        }

        int? itemCount = draftedItemCount(questionnaire);
        string? itemCountDetail = itemCount is int ? string `${itemCount} item(s) drafted` : ();
        map<string>? itemCountPayload = itemCount is int ? {channel: common:WHATSAPP, itemCount: itemCount.toString()} : ();
        future<()> _ = start reportDashboardEvent(request.patientId, common:QUESTIONNAIRE_DRAFTED, itemCountDetail, itemCountPayload);

        return {questionnaire};
    }
}

service /conversation on sharedListener {

    // One turn of the adaptive check-in: extract slots from the latest answer and pick the next question (or finish). Stateless - all history rides in the request; memory is isolated per patient only so the agent's own trace groups cleanly.
    resource function post turn(ConversationTurnRequest request) returns ConversationTurnResponse|http:InternalServerError {
        string query = request.toJsonString();

        string|ai:Error result = interviewAgent.run(query, sessionId = request.patientId);
        if result is ai:Error {
            return <http:InternalServerError>{body: {message: "interview agent run failed: " + result.message()}};
        }

        json|error turnJson = value:fromJsonString(extractJson(result));
        if turnJson is error {
            return <http:InternalServerError>{body: {message: "interview agent did not return valid JSON: " + turnJson.message()}};
        }

        ConversationTurnResponse|error turn = turnJson.cloneWithType();
        if turn is error {
            return <http:InternalServerError>{body: {message: "interview agent JSON did not match expected shape: " + turn.message()}};
        }
        return turn;
    }
}

service /risk\-assessment on sharedListener {

    resource function post .(RiskAssessmentRequest request) returns RiskAssessmentResponse|http:InternalServerError {
        FeatureSlots? slots = request.slots;
        string slotsText = slots is FeatureSlots ? slots.toJsonString() : "not provided";
        string query = string `Patient id: ${request.patientId}. ML probability of a cardiac event: ${
            request.mlProbability}. Structured feature set the ML model scored: ${slotsText}. Questionnaire answers: ${
            request.answers.toJsonString()}.`;

        string|ai:Error result = riskAssessmentAgent.run(query);
        if result is ai:Error {
            return <http:InternalServerError>{body: {message: "agent run failed: " + result.message()}};
        }

        json|error assessmentJson = value:fromJsonString(extractJson(result));
        if assessmentJson is error {
            return <http:InternalServerError>{body: {message: "agent did not return valid JSON: " + assessmentJson.message()}};
        }

        RiskAssessmentResponse|error assessment = assessmentJson.cloneWithType();
        if assessment is error {
            return <http:InternalServerError>{body: {message: "agent JSON did not match expected shape: " + assessment.message()}};
        }

        future<()> _ = start reportDashboardEvent(request.patientId, common:AGENTIC_RISK_ASSESSMENT_DRAFTED,
                string `risk=${assessment.risk}, probability=${assessment.probability}`,
                {risk: assessment.risk, probability: assessment.probability.toString(), reasoning: assessment.reasoning});

        return assessment;
    }
}

service /task\-description on sharedListener {

    resource function post .(TaskDescriptionRequest request) returns TaskDescriptionResponse|http:InternalServerError {
        RiskAssessmentResponse agentic = request.agentic;
        string query = string `Patient: ${request.display.patientName} (${request.display.ageSexSummary}).
ML probability: ${request.mlProbability}. Agentic probability: ${agentic.probability} (risk=${agentic.risk}).
Agentic reasoning: ${agentic.reasoning}
Referenced resources: ${agentic.referencedResources.toJsonString()}
Patient answers: ${request.answers.toJsonString()}`;

        string|ai:Error result = taskDescriptionAgent.run(query);
        if result is ai:Error {
            log:printWarn("task-description agent failed, falling back to a plain summary", 'error = result);
            return {
                description: string `Patient ${request.display.patientName} flagged for review. ML probability: ${
                    request.mlProbability}. Agentic probability: ${agentic.probability} (risk=${agentic.risk}).`
            };
        }
        future<()> _ = start reportDashboardEvent(request.patientId, common:TASK_DESCRIPTION_DRAFTED, (),
                {description: result});
        return {description: result};
    }
}
