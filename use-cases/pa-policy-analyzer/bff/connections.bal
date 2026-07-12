import ballerinax/mysql;
import ballerinax/mysql.driver as _;

import ballerinax/ai.anthropic;
import ballerinax/health.clients.fhir as fhirClient;

final mysql:Client dbClient = check new (
    host = dbHost,
    port = dbPort,
    user = dbUser,
    password = dbPassword,
    database = dbName,
    options = {connectTimeout: 10}
);

final anthropic:ModelProvider anthropicModelprovider = check new (string `${ANTHROPIC_API_KEY}`, "claude-sonnet-4-20250514", maxTokens = 25000);
final fhirClient:FHIRConnector fhirConnectorObj = check new (cernerConfig);
