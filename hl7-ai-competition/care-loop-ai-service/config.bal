configurable string fhirMcpUrl = "http://localhost:8001/mcp/";
configurable string fhirMcpAuthToken = "";
configurable string knowledgeMcpUrl = "http://localhost:8006/mcp";
configurable string pubmedMcpUrl = "http://localhost:8007/mcp";
configurable int listenPort = 8003;

# Choose "openai" (routed through the AMP gateway via AmpModelProvider), "anthropic" (direct), or
# "anthropic-amp" (routed through the AMP gateway via AmpAnthropicModelProvider).
configurable string modelProvider = "openai";

configurable string openAiApiKey = "";
configurable string openAiServiceUrl = "https://api.openai.com/v1";
configurable string nanoModel = "gpt-4.1-nano";
configurable string fullModel = "gpt-4.1";

# anthropicServiceUrl/anthropicApiKey are shared by "anthropic" and "anthropic-amp": point them at
# the real Anthropic API and your Anthropic key for "anthropic", or at the AMP gateway
# (e.g. http://amp:22893/careloop-anthropic) and the minted gateway key for "anthropic-amp".
configurable string anthropicApiKey = "";
configurable string anthropicServiceUrl = "https://api.anthropic.com/v1";

configurable string dashboardEventsUrl = "http://localhost:3003";
