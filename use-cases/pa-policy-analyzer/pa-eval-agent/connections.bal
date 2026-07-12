import ballerinax/mysql;
import ballerinax/mysql.driver as _;

import ballerinax/ai.anthropic;
import ballerinax/health.clients.fhir as fhirClient;

// ── Anthropic Model Provider ───────────────────────────────────────────────────

configurable string ANTHROPIC_API_KEY = ?;

final anthropic:ModelProvider anthropicModelprovider = check new (string `${ANTHROPIC_API_KEY}`, "claude-sonnet-4-20250514", maxTokens = 40000);

// ── MySQL Database Client ──────────────────────────────────────────────────────

configurable string dbHost = "localhost";
configurable int dbPort = 3306;
configurable string dbUser = "root";
configurable string dbPassword = ?;
configurable string dbName = "pa_policy_analyzer";

final mysql:Client dbClient = check new (
    host = dbHost,
    port = dbPort,
    user = dbUser,
    password = dbPassword,
    database = dbName,
    options = {connectTimeout: 10}
);

// ── FHIR Client ────────────────────────────────────────────────────────────────

configurable string base = ?;
configurable string tokenUrl = ?;
configurable string clientId = ?;
configurable string clientSecret = ?;
configurable string[] scopes = ?;

fhirClient:FHIRConnectorConfig cernerConfig = {
    baseURL: base,
    mimeType: fhirClient:FHIR_JSON,
    authConfig: {
        tokenUrl: tokenUrl,
        clientId: clientId,
        clientSecret: clientSecret,
        scopes: scopes
    },
    timeout: 60
};

final fhirClient:FHIRConnector fhirConnectorObj = check new (cernerConfig);
