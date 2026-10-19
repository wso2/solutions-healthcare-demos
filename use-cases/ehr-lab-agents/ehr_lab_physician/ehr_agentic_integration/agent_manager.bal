// WSO2 Agent Manager (AMP) governs the three agents when it is configured:
//
//   identity    each agent has its own AgentID (OAuth client credentials). Its EHR reads go through
//               AMP's MCP proxy in front of the WSO2 FHIR MCP server, which allows only the tools the
//               agent's role grants.
//   AI gateway  each agent calls Claude through its own model configuration in AMP (an LLM proxy over the
//               shared Anthropic provider) with its own key, so usage, budgets and guardrails are per agent
//               and the Anthropic key stays inside AMP.
//   monitoring  every agent run is traced (ballerina/ai's GenAI spans, exported over OTLP by the
//               distribution's ballerina/otel) and shows under that agent in AMP's console;
//               infra/trace-router adds the agent's tracing key per trace.
//
// scripts/amp-setup.sh registers the agents and writes their credentials into secrets.toml. Without
// it the agents call Anthropic and the FHIR MCP servers directly, as before.
//
// Tracing uses ballerina/otel rather than ballerinax/amp: the router supplies the per-agent key that
// ballerinax/amp would send, and ballerina/otel is built for this runtime's OpenTelemetry (1.65),
// where ballerinax/amp 1.1.0 bundles 1.14 jars that clash with it.
import ballerina/otel as _;

# What Agent Manager issued to one of the demo's agents.
#
# + name - the agent's name in Agent Manager
# + displayName - the agent's name as shown in Agent Manager's console
# + llmGatewayUrl - this agent's own AI gateway URL (its model configuration's LLM proxy); empty to use
#   agentManager.llmGatewayUrl
# + llmApiKey - this agent's key for the AI gateway
# + clientId - this agent's AgentID client id
# + clientSecret - this agent's AgentID client secret
# + mcpScopes - proxy key (EHR id or `pubmed`) → scopes this agent requests for that MCP proxy (one token
#   per proxy; its AgentID roles decide what is granted)
# + roles - the AgentID roles amp-setup.sh assigned it, for display
type ManagedAgentConfig record {|
    string name = "";
    string displayName = "";
    string llmGatewayUrl = "";
    string llmApiKey = "";
    string clientId = "";
    string clientSecret = "";
    map<string[]> mcpScopes = {};
    string[] roles = [];
|};

# Agent Manager settings, written by scripts/amp-setup.sh.
#
# + enabled - route the agents through Agent Manager
# + consoleUrl - Agent Manager's console, linked from the portal
# + orgName - organization the agents are registered in
# + projectName - project the agents are registered in
# + llmGatewayUrl - the AI gateway's Anthropic API base (replaces https://api.anthropic.com/v1), for agents
#   without a URL of their own
# + usageUrl - the trace router's usage ledger: tokens and cost per agent run, priced like the gateway
# + tokenUrl - the AgentID token endpoint of the environment's identity provider
# + mcpProxyUrls - EHR id (or `pubmed`) → the MCP proxy in front of that MCP server
# + copilot - the Diagnostic Copilot
# + analyst - the Results Analysis agent
# + carePlanner - the Care Plan agent
type AgentManagerConfig record {|
    boolean enabled = false;
    string consoleUrl = "http://console.amp.localhost:8080";
    string orgName = "default";
    string projectName = "default";
    string llmGatewayUrl = "";
    string usageUrl = "http://trace-router:4318/usage";
    string tokenUrl = "";
    map<string> mcpProxyUrls = {};
    ManagedAgentConfig copilot = {};
    ManagedAgentConfig analyst = {};
    ManagedAgentConfig carePlanner = {};
|};

# Agent Manager integration; off until scripts/amp-setup.sh has registered the agents.
configurable AgentManagerConfig agentManager = {};

# The three agents, by the key used in the API and the portal.
#
# + key - `copilot`, `analyst` or `carePlanner`
# + role - the agent's role, which ballerina/ai records as `gen_ai.agent.name` on its spans
# + config - what Agent Manager issued to it
type ManagedAgent record {|
    string key;
    string role;
    ManagedAgentConfig config;
|};

final readonly & ManagedAgent[] managedAgents = [
    {key: "copilot", role: COPILOT_ROLE, config: agentManager.copilot},
    {key: "analyst", role: ANALYST_ROLE, config: agentManager.analyst},
    {key: "carePlanner", role: CARE_PLANNER_ROLE, config: agentManager.carePlanner}
];

# How one agent is governed, as shown in the portal. Never carries a secret.
#
# + key - `copilot`, `analyst` or `carePlanner`
# + role - the agent's role
# + name - its name in Agent Manager
# + displayName - its name in Agent Manager's console
# + clientId - its AgentID client id
# + llmGateway - whether its model calls go through the AI gateway
# + ehrAccess - how it reaches the EHR: `mcp-proxy` (AgentID), `direct` or `none`
# + roles - its AgentID roles
# + consoleUrl - the agent's traces in Agent Manager's console
type ManagedAgentView record {|
    string key;
    string role;
    string name;
    string displayName;
    string clientId;
    boolean llmGateway;
    string ehrAccess;
    string[] roles;
    string consoleUrl;
|};

# Agent Manager as shown in the portal.
#
# + enabled - whether the agents run under Agent Manager
# + consoleUrl - the console
# + agents - each agent's governance
type AgentManagerView record {|
    boolean enabled;
    string consoleUrl;
    ManagedAgentView[] agents;
|};

# Summarises how the agents are governed, for the portal.
#
# + return - the view
isolated function agentManagerView() returns AgentManagerView {
    ManagedAgentView[] agents = from ManagedAgent agent in managedAgents
        select {
            key: agent.key,
            role: agent.role,
            name: agent.config.name,
            displayName: agent.config.displayName == "" ? agent.role : agent.config.displayName,
            clientId: agent.config.clientId,
            llmGateway: usesLlmGateway(agent.config),
            ehrAccess: agent.key == "carePlanner" ? "none"
                : usesMcpProxy(agent.config) ? "mcp-proxy" : "direct",
            roles: agent.config.roles,
            consoleUrl: agentManager.enabled && agent.config.name != ""
                ? string `${agentManager.consoleUrl}/org/${agentManager.orgName}/project/${agentManager.projectName}/agents/${agent.config.name}/environment/default/observability/traces`
                : ""
        };
    return {enabled: agentManager.enabled, consoleUrl: agentManager.consoleUrl, agents};
}

# Whether an agent's model calls go through the AI gateway.
#
# + agent - what Agent Manager issued to the agent
# + return - true when Agent Manager is on and the agent has a gateway key
isolated function usesLlmGateway(ManagedAgentConfig agent) returns boolean =>
    agentManager.enabled && llmGatewayUrlOf(agent) != "" && agent.llmApiKey != "";

# The AI gateway URL an agent calls: its own model configuration's, else the shared provider's.
#
# + agent - what Agent Manager issued to the agent
# + return - the Anthropic API base URL
isolated function llmGatewayUrlOf(ManagedAgentConfig agent) returns string =>
    agent.llmGatewayUrl != "" ? agent.llmGatewayUrl : agentManager.llmGatewayUrl;

# Whether an agent reads the EHR through Agent Manager's MCP proxy, with its AgentID.
#
# + agent - what Agent Manager issued to the agent
# + return - true when Agent Manager is on, fronts the EHRs with MCP proxies and the agent has an AgentID
isolated function usesMcpProxy(ManagedAgentConfig agent) returns boolean =>
    agentManager.enabled && agentManager.mcpProxyUrls.length() > 0 && agentManager.tokenUrl != ""
        && agent.clientId != "" && agent.clientSecret != "";
