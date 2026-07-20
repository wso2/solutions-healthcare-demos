// AmpModelProvider is the single, provider-agnostic model client the agents use:
// it always speaks OpenAI chat-completions to the AMP AI gateway with an `API-Key`
// header (the minted gateway key). `serviceUrl` picks the route and `modelType`
// the model - "openai" -> careloop-openai (gpt-*), "anthropic" -> careloop-anthropic
// (claude-*, registered under the OpenAI-compatible template against Anthropic's
// OpenAI-compatible endpoint). AMP holds the real provider keys and injects the
// upstream `Authorization: Bearer` itself, so this client never sends Bearer -
// which is also why it's hand-written: the stock ballerinax/ai providers hardwire
// Bearer with no way to send `API-Key`.
//
// `generate` and the vendored libs/ai.openai-native jar are unavoidable overhead:
// ai:Agent needs an ai:ModelProvider (a `distinct` type, so we must `*ai:ModelProvider`),
// which mandates `generate`; being dependently-typed it can only be an external Java
// function, bound to the SDK's native Generator in that jar. The agents only call `chat`.

import ballerina/ai;
import ballerina/http;
import ballerina/jballerina.java;
import ballerina/observe;
import ballerinax/openai.chat;

const int DEFAULT_MAX_TOKEN_COUNT = 512;
const decimal DEFAULT_TEMPERATURE = 0.7;

public isolated distinct client class AmpModelProvider {
    *ai:ModelProvider;
    private final chat:Client llmClient;
    private final string modelType;
    private final http:Client gatewayClient;
    private final string apiKey;
    private final decimal temperature;
    private final int maxTokens;

    public isolated function init(string apiKey, string modelType,
            string serviceUrl = "http://amp:22893/careloop-openai", int maxTokens = DEFAULT_MAX_TOKEN_COUNT,
            decimal temperature = DEFAULT_TEMPERATURE) returns ai:Error? {
        http:Client|error gatewayClient = new (serviceUrl);
        if gatewayClient is error {
            return error ai:Error("Failed to initialize AmpModelProvider", gatewayClient);
        }
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

    isolated remote function generate(ai:Prompt prompt, typedesc<anydata> td = <>) returns td|ai:Error = @java:Method {
        'class: "io.ballerina.lib.ai.openai.Generator"
    } external;
}

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
