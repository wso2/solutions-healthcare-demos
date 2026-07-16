import ballerina/ai;
import ballerina/http;
import ballerina/jballerina.java;
import ballerinax/ai.anthropic;

const string ANTHROPIC_API_VERSION = "2023-06-01";

# Anthropic model provider for the AMP egress gateway: `chat` sends an `API-Key`
# header (not `x-api-key`) so it goes through the gateway; AMP injects the real
# `x-api-key` upstream to Anthropic itself.
public isolated distinct client class AmpAnthropicModelProvider {
    *ai:ModelProvider;
    // Native `generate` reads AnthropicClient/apiKey/modelType/maxTokens/temperature by name; names/types must match ballerinax/ai.anthropic. Unused by the agents (see AmpModelProvider), and would send the wrong auth header (x-api-key, not API-Key) if it ever were invoked.
    private final http:Client AnthropicClient;
    private final string apiKey;
    private final string modelType;
    private final int maxTokens;
    private final decimal temperature;

    public isolated function init(string apiKey, anthropic:ANTHROPIC_MODEL_NAMES modelType,
            string serviceUrl = "https://api.anthropic.com", int maxTokens = DEFAULT_MAX_TOKEN_COUNT,
            decimal temperature = DEFAULT_TEMPERATURE) returns ai:Error? {
        http:Client|error anthropicClient = new (serviceUrl);
        if anthropicClient is error {
            return error ai:Error("Failed to initialize AmpAnthropicModelProvider", anthropicClient);
        }
        self.AnthropicClient = anthropicClient;
        self.apiKey = apiKey;
        self.modelType = modelType;
        self.maxTokens = maxTokens;
        self.temperature = temperature;
    }

    // Sends a chat request to the model through the AMP gateway.
    isolated remote function chat(ai:ChatMessage[]|ai:ChatUserMessage messages, ai:ChatCompletionFunctions[] tools = [],
            string? stop = ()) returns ai:ChatAssistantMessage|ai:Error {
        AmpAnthropicMessage[]|ai:Error anthropicMessages = mapToAmpAnthropicMessages(messages);
        if anthropicMessages is ai:Error {
            return anthropicMessages;
        }

        map<json> requestPayload = {
            model: self.modelType,
            max_tokens: self.maxTokens,
            messages: anthropicMessages,
            temperature: self.temperature
        };
        if stop is string {
            requestPayload["stop_sequences"] = [stop];
        }
        if tools.length() > 0 {
            requestPayload["tools"] = mapToAmpAnthropicTools(tools);
        }

        // Same gateway auth convention as AmpModelProvider: AMP wants API-Key, not the provider's own native header. anthropic-version still travels through and is required upstream.
        map<string> headers = {
            "API-Key": self.apiKey,
            "anthropic-version": ANTHROPIC_API_VERSION,
            "content-type": "application/json"
        };

        AmpAnthropicApiResponse|error response = self.AnthropicClient->post("/v1/messages", requestPayload, headers);
        if response is error {
            return error ai:LlmInvalidResponseError("Unexpected response format from Anthropic API", response);
        }

        spanTag("gen_ai.usage.input_tokens", response.usage.input_tokens.toString());
        spanTag("gen_ai.usage.output_tokens", response.usage.output_tokens.toString());

        return mapToAmpAssistantMessage(response);
    }

    // Required by ai:ModelProvider but unused by the agents; borrows the native impl.
    isolated remote function generate(ai:Prompt prompt, typedesc<anydata> td = <>) returns td|ai:Error = @java:Method {
        'class: "io.ballerina.lib.ai.anthropic.Generator"
    } external;
}

// Anthropic API request message format.
type AmpAnthropicMessage record {|
    string role;
    string content;
|};

// Content block in an Anthropic API response.
type AmpAnthropicContentBlock record {
    string 'type;
    string text?;
    string id?;
    string name?;
    json input?;
};

type AmpAnthropicUsage record {
    int input_tokens;
    int output_tokens;
};

// Anthropic API response format.
type AmpAnthropicApiResponse record {
    string id;
    string model;
    string 'type;
    AmpAnthropicContentBlock[] content;
    string role;
    string stop_reason;
    string? stop_sequence;
    AmpAnthropicUsage usage;
};

type AmpAnthropicTool record {|
    string name;
    string description;
    json input_schema;
|};

isolated function mapToAmpAnthropicMessages(ai:ChatMessage[]|ai:ChatUserMessage messages)
        returns AmpAnthropicMessage[]|ai:Error {
    AmpAnthropicMessage[] anthropicMessages = [];
    if messages is ai:ChatUserMessage {
        anthropicMessages.push({role: ai:USER, content: check mapToStringContent(messages.content)});
        return anthropicMessages;
    }
    foreach ai:ChatMessage message in messages {
        if message is ai:ChatUserMessage {
            anthropicMessages.push({role: ai:USER, content: check mapToStringContent(message.content)});
        } else if message is ai:ChatSystemMessage {
            // Anthropic has no distinct system role over this wire shape; fold it into a user turn.
            string content = check mapToStringContent(message.content);
            anthropicMessages.push({role: ai:USER, content: string `<system>${content}</system>\n\n`});
        } else if message is ai:ChatAssistantMessage && message.content is string {
            anthropicMessages.push({role: ai:ASSISTANT, content: message.content ?: ""});
        } else if message is ai:ChatFunctionMessage && message.content is string {
            anthropicMessages.push({
                role: ai:USER,
                content: string `<function_results>\nFunction: ${message.name}\nOutput: ${
                    message.content ?: ""}\n</function_results>`
            });
        }
    }
    return anthropicMessages;
}

isolated function mapToAmpAnthropicTools(ai:ChatCompletionFunctions[] tools) returns AmpAnthropicTool[] {
    AmpAnthropicTool[] anthropicTools = [];
    foreach ai:ChatCompletionFunctions tool in tools {
        anthropicTools.push({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters ?: {'type: "object", properties: {}}
        });
    }
    return anthropicTools;
}

isolated function mapToAmpAssistantMessage(AmpAnthropicApiResponse response) returns ai:ChatAssistantMessage|ai:Error {
    string? content = ();
    ai:FunctionCall[] toolCalls = [];
    foreach AmpAnthropicContentBlock block in response.content {
        if block.'type == "tool_use" {
            string? blockName = block.name;
            if blockName is () {
                return error ai:LlmError("Invalid or malformed name received in function call response.");
            }
            map<json>?|error arguments = block?.input.cloneWithType();
            if arguments is error {
                return error ai:LlmError("Invalid or malformed arguments received in function call response.", arguments);
            }
            toolCalls.push({name: blockName, arguments});
        } else if block.'type == "text" {
            content = block.text;
        }
    }
    return {role: ai:ASSISTANT, toolCalls: toolCalls == [] ? () : toolCalls, content};
}
