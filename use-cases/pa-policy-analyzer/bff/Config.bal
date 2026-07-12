import ballerinax/health.clients.fhir as fhirClient;

// Anthropic API key for LLM interactions (set this in Config.toml or as an environment variable)
configurable string ANTHROPIC_API_KEY = ?;
configurable string agentServiceUrl = "http://localhost:9090/GapEvalAgent";

// Connection parameters to the Cerner EMR (set these in Config.toml or as environment variables)
// See https://docs.cerner.com for details on obtaining these values.
configurable string base = ?;           // Base URL of the FHIR server
configurable string tokenUrl = ?;       // OAuth2 token endpoint
configurable string clientId = ?;       // OAuth2 client ID
configurable string clientSecret = ?;   // OAuth2 client secret
configurable string[] scopes = ?;       // OAuth2 scopes required for access

// FHIR client configuration for Cerner EMR.
// Includes authentication and connection details.
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

configurable string dbHost = "localhost";
configurable int dbPort = 3306;
configurable string dbUser = "root";
configurable string dbPassword = ?;
configurable string dbName = "pa_policy_analyzer";

// Base URLs for mock services and file storage path (set these in Config.toml or as environment variables)
configurable string MOCK_PDF_SERVICE_BASE = "http://localhost:6092";
configurable string CONVERTER_SERVICE_BASE = "http://localhost:6093/v1";
configurable string STORE_PATH = "./data";

isolated map<string> PATIENTS = {
    "12724066": "Nancy",
    "12724067": "Joe",
    "12724065": "Wilma",
    "12724071": "Valerie",
    "12724070": "Fredrick",
    "12742399": "Sandy",
    "12724069": "Timmy",
    "12742397": "Baby Boy",
    "12724068": "Hailey",
    "12742400": "Tim"
};

const string[] MAJOR_SECTION_TITLES = [
    "Application",
    "Coverage Rationale",
    "Medical Records Documentation Used for Reviews",
    "Medical Record Documentation Used for Reviews",
    "Definitions",
    "Applicable Codes",
    "Description of Services",
    "Background",
    "Clinical Evidence",
    "U.S. Food and Drug Administration",
    "References",
    "Policy History/Revision Information",
    "Instructions for Use"
];
