// Configuration for the EHR + Lab agentic integration.
// Defaults target a local run against `docker compose` (host ports); the container
// overrides them through config/integration.toml. Secrets come from secrets.toml, never from here.

# OAuth2 client-credentials settings for an EHR that needs them (e.g. a Cerner or athenahealth tenant).
#
# + tokenUrl - token endpoint
# + clientId - client id registered with the EHR
# + clientSecret - client secret
# + scopes - scopes to request
type OAuthClientConfig record {|
    string tokenUrl;
    string clientId;
    string clientSecret;
    string[] scopes = [];
|};

# An EHR the integration is connected to. Every EHR is reached through the same generic FHIR
# connector; pointing one at a real tenant is a change of `fhirBaseUrl` and `auth`.
#
# + id - short id used in API paths and stored on each assessment (`cerner`, `athena`)
# + displayName - name shown in the portal and on the timeline
# + vendor - which product this is, for the portal's badge (`cerner`, `athena`, `epic`, `fhir`)
# + fhirBaseUrl - FHIR R4 base URL
# + auth - client credentials, when the EHR needs them
# + mcpServerUrl - the WSO2 FHIR MCP server in front of this EHR (trailing slash matters: `/mcp` answers 307)
# + mrnSystem - identifier system of the EHR's medical record numbers
# + organizationId - the clinic's Organization in this EHR, used as the visit's service provider
# + outageProxy - the Toxiproxy proxy in front of this EHR, for the presenter's outage switch
type EhrSystemConfig record {|
    string id;
    string displayName;
    string vendor;
    string fhirBaseUrl;
    OAuthClientConfig? auth = ();
    string mcpServerUrl;
    string mrnSystem;
    string organizationId = "org-longview-clinic";
    string? outageProxy = ();
|};

// ── Systems of record ──

# The EHRs the physician can pull patients from.
configurable EhrSystemConfig[] ehrSystems = [
    {
        id: "cerner", displayName: "Oracle Health (Cerner)", vendor: "cerner",
        fhirBaseUrl: "http://localhost:8081/fhir/r4", mcpServerUrl: "http://localhost:8010/mcp/",
        mrnSystem: "urn:oid:2.16.840.1.113883.3.787.0.0", outageProxy: "cerner"
    },
    {
        id: "athena", displayName: "athenahealth", vendor: "athena",
        fhirBaseUrl: "http://localhost:8083/fhir/r4", mcpServerUrl: "http://localhost:8011/mcp/",
        mrnSystem: "urn:demo:athenahealth:mrn", outageProxy: "athena"
    }
];

# FHIR base URL of the reference lab.
configurable string labFhirBaseUrl = "http://localhost:8082/fhir/r4";
# Name of the reference lab, as shown in the portal and on orders.
configurable string labDisplayName = "Quest Diagnostics";
# The lab's Organization id, named as the performer of every order.
configurable string labOrganizationId = "org-quest-lab";

# Shared key the lab must present on its notifications.
configurable string labWebhookApiKey = "demo-lab-webhook-key";
# How often the fallback poller checks the lab for a specimen or a report a notification may have missed.
configurable decimal labPollIntervalSeconds = 20;
# How long an assessment waits for the patient to visit the lab before it is closed as timed out.
configurable int labVisitTimeoutDays = 30;
# How long an assessment waits for lab results after the specimen is collected.
configurable int labResultTimeoutHours = 72;

# Years of EHR history pulled into the patient summary's trends.
configurable int summaryLookbackYears = 3;

// ── WSO2 FHIR MCP server (the agents' read-only window onto the EHR) ──
# Only read tools. Every write to an EHR goes through a workflow activity, never through an agent.
configurable string[] ehrMcpPermittedTools = ["search", "read", "get_capabilities"];

# The PubMed MCP server (literature search for all three agents); empty to leave it out.
configurable string pubmedMcpUrl = "http://localhost:8012/mcp";

// ── Integration database (agent memory + assessment read model) ──
# Postgres host.
configurable string dbHost = "localhost";
# Postgres port.
configurable int dbPort = 5433;
# Postgres user.
configurable string dbUser = "demo";
# Postgres password.
configurable string dbPassword = "demo";
# Database holding agent memory and the assessment read model.
configurable string dbName = "longevity";

// ── Model provider ──
# "anthropic" | "openrouter" | "wso2" (the WSO2 Integrator default provider).
configurable string modelProvider = "anthropic";
# Anthropic API key; set in secrets.toml.
configurable string anthropicApiKey = "";
# Anthropic model.
configurable string anthropicModelName = "claude-sonnet-4-6";
# Anthropic API base URL.
configurable string anthropicServiceUrl = "https://api.anthropic.com/v1";
# OpenRouter API key, for calls without Agent Manager; set in secrets.toml.
configurable string openrouterApiKey = "";
# OpenRouter model id (provider/model, as OpenRouter lists it).
configurable string openrouterModelName = "deepseek/deepseek-v4.1-flash";
# OpenRouter API base URL (OpenAI-compatible).
configurable string openrouterServiceUrl = "https://openrouter.ai/api/v1";
# Output token limit per model call.
configurable int maxTokens = 8192;
# Timeout for one model call.
configurable decimal modelTimeoutSeconds = 240;
# Tool-use iterations an agent may take before giving up.
configurable int agentMaxIter = 16;
# Log every agent step.
configurable boolean agentVerbose = false;
# Messages kept per agent conversation in Postgres before the oldest are trimmed.
configurable int agentMemoryMaxMessages = 60;
# Most explorer rows the physician can hand to the Copilot in one evaluation.
configurable int evaluationMaxRecords = 300;

// ── Workflow retries ──
# Automatic attempts for an EHR or lab call before a person is asked to decide (retry or stop).
configurable int fhirMaxRetries = 6;
# Seconds before the first retry; later retries back off up to `fhirMaxRetryDelaySeconds`.
configurable decimal fhirRetryDelaySeconds = 2;
# Longest gap between two automatic retries.
configurable decimal fhirMaxRetryDelaySeconds = 10;

// ── Demo controls ──
# Toxiproxy admin API, which the presenter's outage switches drive.
configurable string toxiproxyUrl = "http://localhost:8474";
# Toxiproxy proxy carrying the lab's webhook to the integration (the "lab webhook down" switch).
configurable string labWebhookProxy = "lab-webhook";
# Allow the presenter's "crash the integration" switch (the container restarts it).
configurable boolean allowCrashSimulation = true;

// ── API ──
# Port of the portal API.
configurable int apiPort = 9090;
# Browser origins allowed to call the API.
configurable string[] corsAllowOrigins = ["http://localhost:5173"];
# The physician the demo runs as.
configurable string defaultPractitionerId = "prac-elena-park";
# Temporal UI, linked from the portal.
configurable string temporalUiUrl = "http://localhost:8233";
# Temporal's HTTP API, read for live retry attempts of a pending activity (the activity tree records
# attempts only once an activity finishes).
configurable string temporalHttpUrl = "http://localhost:7243";
# Temporal namespace the workflows run in.
configurable string temporalNamespace = "default";
