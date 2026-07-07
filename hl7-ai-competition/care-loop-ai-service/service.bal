import ballerina/ai;
import ballerina/http;
import ballerina/lang.value;
import ballerina/log;
import ballerinax/ai.openai;

final ai:McpToolKit fhirToolkit = check new (fhirMcpUrl);
final ai:ModelProvider nanoModelProvider = check new openai:ModelProvider(openAiApiKey, openai:GPT_4_1_NANO);
final ai:ModelProvider fullModelProvider = check new openai:ModelProvider(openAiApiKey, openai:GPT_4_1);

final ai:Agent questionnaireAgent = check new (
    systemPrompt = {
        role: "Care Loop clinical assistant",
        instructions: questionnaireSystemPrompt
    },
    model = nanoModelProvider,
    tools = [fhirToolkit],
    verbose = true
);

final ai:Agent riskAssessmentAgent = check new (
    systemPrompt = {
        role: "Care Loop clinical assistant",
        instructions: riskAssessmentSystemPrompt
    },
    model = fullModelProvider,
    tools = [fhirToolkit],
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

listener http:Listener sharedListener = new (listenPort);

service /questionnaires on sharedListener {

    resource function post .(QuestionnaireRequest request) returns QuestionnaireResponse|http:InternalServerError {
        string query = string `Patient id: ${request.patientId}.`;

        string|ai:Error result = questionnaireAgent.run(query);
        if result is ai:Error {
            return <http:InternalServerError>{body: {message: "agent run failed: " + result.message()}};
        }

        json|error questionnaire = value:fromJsonString(result);
        if questionnaire is error {
            return <http:InternalServerError>{body: {message: "agent did not return valid JSON: " + questionnaire.message()}};
        }
        return {questionnaire};
    }
}

service /risk\-assessment on sharedListener {

    resource function post .(RiskAssessmentRequest request) returns RiskAssessmentResponse|http:InternalServerError {
        string query = string `Patient id: ${request.patientId}. ML probability of a cardiac event: ${
            request.mlProbability}. Questionnaire answers: ${request.answers.toJsonString()}.`;

        string|ai:Error result = riskAssessmentAgent.run(query);
        if result is ai:Error {
            return <http:InternalServerError>{body: {message: "agent run failed: " + result.message()}};
        }

        json|error assessmentJson = value:fromJsonString(result);
        if assessmentJson is error {
            return <http:InternalServerError>{body: {message: "agent did not return valid JSON: " + assessmentJson.message()}};
        }

        RiskAssessmentResponse|error assessment = assessmentJson.cloneWithType();
        if assessment is error {
            return <http:InternalServerError>{body: {message: "agent JSON did not match expected shape: " + assessment.message()}};
        }
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
        return {description: result};
    }
}
