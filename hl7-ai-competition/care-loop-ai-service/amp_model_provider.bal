import ballerina/ai;
import ballerina/http;
import ballerina/jballerina.java;
import ballerina/observe;
import ballerinax/ai.openai;
import ballerinax/openai.chat;

const int DEFAULT_MAX_TOKEN_COUNT = 512;
const decimal DEFAULT_TEMPERATURE = 0.7;

# OpenAI model provider for the AMP egress gateway: `chat` sends an `API-Key`
# header (not `Authorization: Bearer`) so it goes through the gateway.
public isolated distinct client class AmpModelProvider {
    *ai:ModelProvider;
    // Native `generate` reads llmClient and modelType; names/types must match ballerinax/ai.openai.
    private final chat:Client llmClient;
    private final openai:OPEN_AI_MODEL_NAMES modelType;
    private final http:Client gatewayClient;
    private final string apiKey;
    private final decimal temperature;
    private final int maxTokens;

    public isolated function init(string apiKey, openai:OPEN_AI_MODEL_NAMES modelType,
            string serviceUrl = "https://api.openai.com/v1", int maxTokens = DEFAULT_MAX_TOKEN_COUNT,
            decimal temperature = DEFAULT_TEMPERATURE) returns ai:Error? {
        http:Client|error gatewayClient = new (serviceUrl);
        if gatewayClient is error {
            return error ai:Error("Failed to initialize AmpModelProvider", gatewayClient);
        }
        // Only `generate` uses this Bearer-authenticated client; the gateway does not accept it.
        chat:Client|error llmClient = new ({auth: {token: apiKey}}, serviceUrl);
        if llmClient is error {
            return error ai:Error("Failed to initialize AmpModelProvider", llmClient);
        }
        self.gatewayClient = gatewayClient;
        self.llmClient = llmClient;
        self.modelType = modelType;
        self.apiKey = apiKey;
        self.temperature = temperature;
        self.maxTokens = maxTokens;
    }

    // Sends a chat request to the model through the AMP gateway.
    isolated remote function chat(ai:ChatMessage[]|ai:ChatUserMessage messages, ai:ChatCompletionFunctions[] tools = [],
            string? stop = ()) returns ai:ChatAssistantMessage|ai:Error {
        chat:CreateChatCompletionRequest request = {
            max_completion_tokens: self.maxTokens,
            temperature: self.temperature,
            stop,
            model: self.modelType,
            messages: check mapToCompletionRequestMessages(messages)
        };
        if tools.length() > 0 {
            request.functions = tools;
        }
        chat:CreateChatCompletionResponse|error response =
            self.gatewayClient->post("/chat/completions", request.toJson(), {"API-Key": self.apiKey});
        // Add GenAI token-usage tags so Agent Manager renders them on the span.
        if response is chat:CreateChatCompletionResponse {
            chat:CompletionUsage? usage = response.usage;
            if usage is chat:CompletionUsage {
                spanTag("gen_ai.usage.input_tokens", usage.prompt_tokens.toString());
                spanTag("gen_ai.usage.output_tokens", usage.completion_tokens.toString());
                spanTag("gen_ai.usage.total_tokens", usage.total_tokens.toString());
            }
        }
        if response is error {
            return error ai:LlmConnectionError("Error while connecting to the model", response);
        }
        chat:CreateChatCompletionResponse_choices[] choices = response.choices;
        if choices.length() == 0 {
            return error ai:LlmInvalidResponseError("Empty response from the model when using function call API");
        }
        return mapToAssistantMessage(choices[0].message);
    }

    // Required by ai:ModelProvider but unused by the agents; borrows the native impl.
    isolated remote function generate(ai:Prompt prompt, typedesc<anydata> td = <>) returns td|ai:Error = @java:Method {
        'class: "io.ballerina.lib.ai.openai.Generator"
    } external;
}

// Best-effort span tag; observability failures must not break the LLM call.
isolated function spanTag(string key, string value) {
    error? result = observe:addTagToSpan(key, value);
    if result is error {
    }
}

isolated function mapToCompletionRequestMessages(ai:ChatMessage[]|ai:ChatUserMessage messages)
        returns chat:ChatCompletionRequestMessage[]|ai:Error {
    if messages is ai:ChatUserMessage {
        return [{role: ai:USER, content: check mapToStringContent(messages.content)}];
    }
    chat:ChatCompletionRequestMessage[] requestMessages = [];
    foreach ai:ChatMessage message in messages {
        if message is ai:ChatAssistantMessage {
            requestMessages.push(mapToRequestAssistantMessage(message));
        } else if message is ai:ChatUserMessage {
            requestMessages.push({role: ai:USER, content: check mapToStringContent(message.content)});
        } else if message is ai:ChatSystemMessage {
            requestMessages.push({role: ai:SYSTEM, content: check mapToStringContent(message.content)});
        } else if message is ai:ChatFunctionMessage {
            requestMessages.push({role: "function", content: message.content, name: message.name});
        }
    }
    return requestMessages;
}

isolated function mapToRequestAssistantMessage(ai:ChatAssistantMessage message)
        returns chat:ChatCompletionRequestAssistantMessage {
    chat:ChatCompletionRequestAssistantMessage assistantMessage = {role: ai:ASSISTANT};
    ai:FunctionCall[]? toolCalls = message.toolCalls;
    if toolCalls is ai:FunctionCall[] && toolCalls.length() > 0 {
        assistantMessage.function_call = {
            name: toolCalls[0].name,
            arguments: toolCalls[0].arguments.toJsonString()
        };
    }
    string? content = message?.content;
    if content is string {
        assistantMessage.content = content;
    }
    return assistantMessage;
}

isolated function mapToAssistantMessage(chat:ChatCompletionResponseMessage? message)
        returns ai:ChatAssistantMessage|ai:LlmError {
    ai:ChatAssistantMessage assistantMessage = {role: ai:ASSISTANT, content: message?.content};
    chat:ChatCompletionRequestAssistantMessage_function_call? functionCall = message?.function_call;
    if functionCall is () {
        return assistantMessage;
    }
    do {
        json arguments = check functionCall.arguments.fromJsonString();
        assistantMessage.toolCalls = [{name: functionCall.name, arguments: check arguments.cloneWithType()}];
    } on fail error e {
        return error ai:LlmError("Invalid or malformed arguments received in function call response.", e);
    }
    return assistantMessage;
}

isolated function mapToStringContent(ai:Prompt|string prompt) returns string|ai:Error {
    if prompt is string {
        return prompt;
    }
    string[] & readonly strings = prompt.strings;
    anydata[] insertions = prompt.insertions;
    string promptStr = strings[0];
    foreach int i in 0 ..< insertions.length() {
        string str = strings[i + 1];
        anydata insertion = insertions[i];
        if insertion is ai:TextDocument|ai:TextChunk {
            promptStr += insertion.content + " " + str;
            continue;
        }
        if insertion is ai:TextDocument[] {
            foreach ai:TextDocument doc in insertion {
                promptStr += doc.content + " ";
            }
            promptStr += str;
            continue;
        }
        if insertion is ai:Document {
            return error ai:Error("Only text documents are currently supported.");
        }
        promptStr += insertion.toString() + str;
    }
    return promptStr.trim();
}
