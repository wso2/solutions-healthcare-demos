import ballerinax/ai.anthropic;

final anthropic:ModelProvider _CallCenterAgentModel = check new (
    ANTHROPIC_API_KEY, 
    "claude-sonnet-4-20250514", 
    maxTokens = 1028, 
    serviceUrl = AGENT_AI_GATEWAY_URL,
    connectionConfig = connectionConfig
);

anthropic:ConnectionConfig connectionConfig = {
    secureSocket: {
        cert: {
            path: PATH_TO_CLIENT_TRUSTSTORE,
            password: TRUSTSTORE_PASSWORD
        }
    }
};
