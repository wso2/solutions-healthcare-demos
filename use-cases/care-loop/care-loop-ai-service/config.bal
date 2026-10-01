// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

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
