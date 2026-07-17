configurable string fhirMcpUrl = "http://localhost:8001/mcp/";
configurable string fhirMcpAuthToken = "";
configurable string knowledgeMcpUrl = "http://localhost:8006/mcp";
configurable string pubmedMcpUrl = "http://localhost:8007/mcp";
configurable int listenPort = 8003;

# modelProvider: "openai" or "anthropic" - both route only through the AMP gateway. Set nanoModel/fullModel to the provider's model ids (gpt-* or claude-*).
configurable string modelProvider = "openai";

# *ApiKey are the minted AMP gateway keys; *ServiceUrl are the gateway routes, never api.openai.com/api.anthropic.com (see amp_model_provider.bal for how anthropic reaches Claude through the gateway).
configurable string openAiApiKey = "";
configurable string openAiServiceUrl = "http://amp:22893/careloop-openai";
configurable string nanoModel = "gpt-4.1-nano";
configurable string fullModel = "gpt-4.1";
configurable string anthropicApiKey = "";
configurable string anthropicServiceUrl = "http://amp:22893/careloop-anthropic";

configurable string dashboardEventsUrl = "http://localhost:3003";
