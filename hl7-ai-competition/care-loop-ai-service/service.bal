import ballerina/ai;
import ballerina/http;
import ballerina/lang.value;
import ballerinax/ai.openai;

final ai:McpToolKit fhirToolkit = check new (fhirMcpUrl);
final ai:ModelProvider openAiProvider = check new openai:ModelProvider(openAiApiKey, openai:GPT_4_1_NANO);

final ai:Agent questionnaireAgent = check new (
    systemPrompt = {
        role: "Care Loop clinical assistant",
        instructions: questionnaireSystemPrompt
    },
    model = openAiProvider,
    tools = [fhirToolkit],
    verbose = true
);

service /questionnaires on new http:Listener(listenPort) {

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
