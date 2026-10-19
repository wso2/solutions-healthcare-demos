// Named to sort after agent_manager.bal: Ballerina 2201.14.1 rejects isolated access to its configurable
// from files that sort before it (see ISSUES_TO_REPORT.md, B12).
import ballerina/http;
import ballerina/mcp;
import ballerina/time;
import ballerinax/health.clients.fhir;

// What each agent may do, asked live of WSO2 Agent Manager rather than read from config: the access matrix
// requests each agent's AgentID token for each permission and shows what the identity provider granted
// (scopes are trimmed to the agent's roles), and a probe makes a real, harmless MCP call as the agent
// through the proxy, so the audience sees the gateway allow or refuse it.

# A permission an agent may hold: one scope on one MCP proxy.
#
# + key - id used by the API and the portal
# + label - what it lets an agent do
# + target - the proxy (key in `agentManager.mcpProxyUrls`)
# + scope - the AgentID scope that grants it (`<proxy>:<action>`)
# + probeTool - a harmless tool to call when probing it; nil for permissions that are never probed (writes)
# + probeArgs - the probe tool's arguments
type Permission record {|
    string key;
    string label;
    string target;
    string scope;
    string? probeTool;
    record {} probeArgs = {};
|};

final readonly & Permission[] PERMISSIONS = [
    {key: "ehr-read-cerner", label: "Read the Cerner EHR", target: "cerner", scope: "fhir-cerner:read", probeTool: "get_capabilities"},
    {key: "ehr-read-athena", label: "Read the Athena EHR", target: "athena", scope: "fhir-athena:read", probeTool: "get_capabilities"},
    {key: "ehr-write", label: "Change EHR records", target: "cerner", scope: "fhir-cerner:write", probeTool: ()},
    {key: "literature", label: "Search PubMed", target: "pubmed", scope: "pubmed:search", probeTool: "search_pubmed",
        probeArgs: {"query": "lipoprotein(a) cardiovascular risk", "maxResults": 1}}
];

# Whether one agent holds one permission.
#
# + permission - the permission key
# + granted - whether the identity provider granted the scope
# + detail - what the identity provider answered
type AccessCell record {|
    string permission;
    boolean granted;
    string detail;
|};

# One agent's row of the matrix.
#
# + key - `copilot`, `analyst` or `carePlanner`
# + displayName - its name in Agent Manager
# + clientId - its AgentID client id
# + roles - the roles amp-setup.sh assigned it
# + cells - one per permission
type AccessRow record {|
    string key;
    string displayName;
    string clientId;
    string[] roles;
    AccessCell[] cells;
|};

# The access matrix, as Agent Manager answers it now.
#
# + enabled - whether the agents run under Agent Manager with AgentIDs and MCP proxies (probes possible)
# + checkedAt - when it was asked
# + issuer - the AgentID token endpoint asked
# + permissions - the columns
# + rows - one per agent
type AccessMatrix record {|
    boolean enabled;
    string checkedAt;
    string issuer;
    Permission[] permissions;
    AccessRow[] rows;
|};

# What a probe saw.
#
# + agent - the agent it ran as
# + permission - the permission probed
# + allowed - whether the call went through
# + outcome - `allowed`, `refused` (by Agent Manager) or `error` (something else failed)
# + detail - what happened, in a sentence
# + tokenScopes - the scopes in the token the agent presented
# + durationMs - how long the probe took
type ProbeResult record {|
    string agent;
    string permission;
    boolean allowed;
    string outcome;
    string detail;
    string tokenScopes;
    int durationMs;
|};

# An AgentID token, or why there is none.
#
# + accessToken - the token; empty when none was issued
# + scope - the scopes granted
# + error - the identity provider's error, when it issued none
type AgentToken record {|
    string accessToken = "";
    string scope = "";
    string? 'error = ();
|};

# Asks Agent Manager what every agent may do.
#
# + return - the matrix
isolated function accessMatrix() returns AccessMatrix {
    boolean enabled = agentManager.enabled && agentManager.tokenUrl != "" && agentManager.mcpProxyUrls.length() > 0;
    AccessRow[] rows = [];
    foreach ManagedAgent agent in managedAgents {
        AccessCell[] cells = [];
        foreach Permission permission in PERMISSIONS {
            if !enabled || agent.config.clientId == "" {
                cells.push({permission: permission.key, granted: false,
                    detail: agent.config.clientId == "" ? "no AgentID" : "no MCP proxies yet (run scripts/amp-setup.sh)"});
                continue;
            }
            AgentToken token = agentToken(agent.config, permission);
            boolean granted = token.scope.trim() != "" && re `\s+`.split(token.scope.trim()).indexOf(permission.scope) is int;
            string? tokenError = token.'error;
            cells.push({
                permission: permission.key,
                granted,
                detail: granted ? string `granted ${permission.scope}`
                    : tokenError is string ? tokenError : string `token without ${permission.scope}`
            });
        }
        rows.push({
            key: agent.key,
            displayName: agent.config.displayName == "" ? agent.role : agent.config.displayName,
            clientId: agent.config.clientId,
            roles: agent.config.roles,
            cells
        });
    }
    return {enabled, checkedAt: time:utcToString(time:utcNow()), issuer: agentManager.tokenUrl,
        permissions: [...PERMISSIONS], rows};
}

# Makes a real, harmless MCP call as an agent through Agent Manager's proxy.
#
# + agentKey - `copilot`, `analyst` or `carePlanner`
# + permissionKey - the permission to exercise
# + return - what happened, or an error for an unknown agent or permission
isolated function probeAccess(string agentKey, string permissionKey) returns ProbeResult|error {
    ManagedAgent[] matches = managedAgents.filter(a => a.key == agentKey);
    Permission[] permissions = PERMISSIONS.filter(p => p.key == permissionKey);
    if matches.length() == 0 || permissions.length() == 0 {
        return error(string `Unknown agent "${agentKey}" or permission "${permissionKey}"`);
    }
    ManagedAgent agent = matches[0];
    Permission permission = permissions[0];
    string? tool = permission.probeTool;
    string? proxyUrl = agentManager.mcpProxyUrls[permission.target];
    if tool is () {
        return error(string `"${permission.label}" is never probed: it would change a system of record`);
    }
    if !usesMcpProxy(agent.config) || proxyUrl is () {
        return error("Agent Manager MCP proxies are not configured (run scripts/amp-setup.sh)");
    }
    time:Utc started = time:utcNow();
    AgentToken token = agentToken(agent.config, permission);
    ProbeResult result = {agent: agentKey, permission: permissionKey, allowed: false, outcome: "refused",
        detail: "", tokenScopes: token.scope, durationMs: 0};
    if token.accessToken == "" {
        result.detail = string `The identity provider issued no token: ${token.'error ?: "no grant"}.`;
    } else {
        // The agent presents whatever it was granted; the gateway decides whether the tool is covered.
        mcp:StreamableHttpClient|error proxy = new (proxyUrl, auth = {token: token.accessToken}, timeout = 30);
        if proxy is error {
            result.outcome = "error";
            result.detail = proxy.message();
        } else {
            mcp:StreamableHttpClient session = proxy;
            error? handshake = session->initialize({name: "access-probe", version: "1.0.0"});
            mcp:CallToolResult|error call;
            if handshake is error {
                call = handshake;
            } else {
                call = session->callTool({name: tool, arguments: permission.probeArgs});
            }
            if call is mcp:CallToolResult {
                result.allowed = true;
                result.outcome = "allowed";
                result.detail = string `${tool} answered through the ${permission.target} MCP proxy.`;
            } else {
                string message = call.message();
                boolean refused = message.includes("401") || message.includes("403")
                    || message.toLowerAscii().includes("forbidden") || message.toLowerAscii().includes("unauthorized");
                result.outcome = refused ? "refused" : "error";
                result.detail = refused ? string `Agent Manager refused ${tool}: ${compact(message)}`
                    : string `The call failed: ${compact(message)}`;
            }
            error? closed = session->close();
            if closed is error {
                // The session may already be gone after a refusal; nothing to clean up.
            }
        }
    }
    result.durationMs = <int>(time:utcDiffSeconds(time:utcNow(), started) * 1000);
    return result;
}

# Requests an agent's AgentID token for one permission (client credentials, the proxy as the resource).
#
# + agent - what Agent Manager issued to the agent
# + permission - the permission whose scope to request
# + return - the token, or the identity provider's reason for refusing one
isolated function agentToken(ManagedAgentConfig agent, Permission permission) returns AgentToken {
    string resourceUrl = agentManager.mcpProxyUrls[permission.target] ?: "";
    http:Client|error idp = new (agentManager.tokenUrl, auth = {username: agent.clientId, password: agent.clientSecret},
        timeout = 15);
    if idp is error {
        return {'error: idp.message()};
    }
    map<string> form = {grant_type: "client_credentials", scope: permission.scope};
    if resourceUrl != "" {
        form["resource"] = resourceUrl;
    }
    http:Response|error response = idp->post("", form, mediaType = "application/x-www-form-urlencoded");
    if response is error {
        return {'error: response.message()};
    }
    json|error body = response.getJsonPayload();
    if body !is map<json> {
        return {'error: string `HTTP ${response.statusCode}`};
    }
    if response.statusCode != 200 {
        json description = body["error_description"] ?: body["error"];
        return {'error: description is string ? description : string `HTTP ${response.statusCode}`};
    }
    json accessToken = body["access_token"];
    json scope = body["scope"];
    return {accessToken: accessToken is string ? accessToken : "", scope: scope is string ? scope : ""};
}

isolated function compact(string message) returns string =>
    message.length() > 220 ? message.substring(0, 220) + "…" : message;

type DeidentifySample record {|
    string ehr;
    string patientId;
    # The Patient as the FHIR server returns it.
    json raw;
    # The same Patient as the Diagnostic Copilot receives it through Agent Manager's MCP proxy.
    json governed;
    boolean allowed;
    string detail;
    int durationMs;
|};

# One Patient read twice: from the EHR's FHIR server directly, and with the FHIR MCP server's `read` tool as
# the Diagnostic Copilot through Agent Manager's MCP proxy, where `mcp-fhir-deidentify` rewrites the result.
# The portal puts the two side by side. No model is called.
#
# + ehr - the EHR id
# + patientId - the Patient's id in that EHR
# + return - both versions, or an error when the EHR, the agent or the proxy is not configured
isolated function deidentifySample(string ehr, string patientId) returns DeidentifySample|error {
    ManagedAgent[] copilots = managedAgents.filter(a => a.key == "copilot");
    Permission[] permissions = PERMISSIONS.filter(p => p.key == "ehr-read-" + ehr);
    string? proxyUrl = agentManager.mcpProxyUrls[ehr];
    if copilots.length() == 0 || permissions.length() == 0 || proxyUrl is () || !usesMcpProxy(copilots[0].config) {
        return error("Agent Manager MCP proxies are not configured (run scripts/amp-setup.sh)");
    }
    fhir:FHIRResponse direct = check (check ehrClient(ehr))->getById("Patient", patientId);
    time:Utc started = time:utcNow();
    DeidentifySample sample = {ehr, patientId, raw: <json>direct.'resource, governed: (), allowed: false, detail: "",
        durationMs: 0};
    AgentToken token = agentToken(copilots[0].config, permissions[0]);
    if token.accessToken == "" {
        sample.detail = string `The identity provider issued no token: ${token.'error ?: "no grant"}.`;
        return sample;
    }
    mcp:StreamableHttpClient session = check new (proxyUrl, auth = {token: token.accessToken}, timeout = 30);
    do {
        check session->initialize({name: "deidentify-sample", version: "1.0.0"});
        mcp:CallToolResult result = check session->callTool({name: "read", arguments: {"type": "Patient", "id": patientId}});
        json content = result.toJson();
        json[] items = content.content is json[] ? <json[]>(check content.content) : [];
        foreach json item in items {
            json text = item is map<json> ? item["text"] : ();
            if text is string {
                json|error parsed = text.fromJsonString();
                sample.governed = parsed is error ? text : parsed;
                break;
            }
        }
        sample.allowed = !(content.isError is boolean && check content.isError == true);
        sample.detail = string `read Patient/${patientId} through the ${ehr} MCP proxy as the Diagnostic Copilot.`;
    } on fail error failure {
        sample.detail = string `The governed read failed: ${compact(failure.message())}`;
    }
    error? closed = session->close();
    if closed is error {
        // The session may already be gone; nothing to clean up.
    }
    sample.durationMs = <int>(time:utcDiffSeconds(time:utcNow(), started) * 1000);
    return sample;
}
