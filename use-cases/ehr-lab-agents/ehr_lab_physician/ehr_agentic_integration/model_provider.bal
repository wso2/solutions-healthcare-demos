import ballerina/ai;
import ballerina/http;
import ballerinax/ai.anthropic;
import ballerinax/ai.openrouter;

// Same provider switch as the PA platform agents, trimmed to the providers this demo uses.
// Each agent gets its own provider: under Agent Manager each one calls the AI gateway with its own
// key, so the gateway can meter, limit and guard the agents separately.

final ai:ModelProvider copilotModel = check initModelProvider(agentManager.copilot);
final ai:ModelProvider analystModel = check initModelProvider(agentManager.analyst);
final ai:ModelProvider carePlanModel = check initModelProvider(agentManager.carePlanner);

# Builds the model provider for one agent: Claude through Agent Manager's AI gateway when the agent
# has a gateway key, Claude directly otherwise.
#
# + agent - what Agent Manager issued to the agent
# + return - the provider, or an error for an unknown provider or model name
isolated function initModelProvider(ManagedAgentConfig agent) returns ai:ModelProvider|error {
    match modelProvider {
        "anthropic" => {
            anthropic:ANTHROPIC_MODEL_NAMES modelName = check anthropicModelName.cloneWithType();
            // The gateway speaks the Anthropic Messages API and takes the agent's key in the same
            // `x-api-key` header, swapping it for the real Anthropic key upstream.
            boolean viaGateway = usesLlmGateway(agent);
            return new anthropic:ModelProvider(viaGateway ? agent.llmApiKey : anthropicApiKey, modelName,
                    serviceUrl = viaGateway ? llmGatewayUrlOf(agent) : anthropicServiceUrl,
                    maxTokens = maxTokens, timeout = modelTimeoutSeconds);
        }
        "openrouter" => {
            // OpenRouter speaks the OpenAI chat-completions API with a Bearer key. Through Agent Manager,
            // the agent's OpenRouter model configuration takes the agent's key from the same header
            // (valuePrefix "Bearer ") and swaps it for the OpenRouter key upstream.
            boolean viaGateway = usesLlmGateway(agent);
            return new openrouter:ModelProvider(viaGateway ? agent.llmApiKey : openrouterApiKey, openrouterModelName,
                    serviceUrl = viaGateway ? llmGatewayUrlOf(agent) : openrouterServiceUrl,
                    maxTokens = maxTokens, timeout = modelTimeoutSeconds, httpVersion = http:HTTP_1_1);
        }
        "wso2" => {
            return ai:getDefaultModelProvider();
        }
        _ => {
            return error(string `Unknown modelProvider "${modelProvider}". Valid values: anthropic, openrouter, wso2.`);
        }
    }
}

# Whether the configured provider has what it needs to make calls. Checked before an agent runs so
# a missing key surfaces as a clear assessment error instead of an opaque HTTP 401.
#
# + return - an error describing the missing setting, or nil when the provider is usable
isolated function checkModelConfigured() returns error? {
    string key = modelProvider == "anthropic" ? anthropicApiKey : modelProvider == "openrouter" ? openrouterApiKey : "n/a";
    string setting = modelProvider == "anthropic" ? "anthropicApiKey" : "openrouterApiKey";
    foreach ManagedAgent agent in managedAgents {
        if !usesLlmGateway(agent.config) && key.trim().length() == 0 {
            return error(string `${agent.role} has no model key: add ${setting} to secrets.toml `
                + "(see secrets.example.toml), or register the agents with scripts/amp-setup.sh.");
        }
    }
}

# The model the agents use, as the portal shows it.
#
# + return - the model name of the configured provider
isolated function activeModelName() returns string =>
    modelProvider == "openrouter" ? openrouterModelName : modelProvider == "anthropic" ? anthropicModelName : "default";
