import ballerina/http;
import ballerinax/health.clients.fhir;
import ballerinax/postgresql;
import ballerinax/postgresql.driver as _;

// ── FHIR systems of record ──
// One generic FHIR connector per system (the same pattern as pa-policy-analyzer). Auth is
// optional: the local wso2/fhir-server needs none, a Cerner or athenahealth tenant needs client credentials.

# Connectors to every configured EHR, by EHR id.
isolated map<fhir:FHIRConnector> ehrConnectors = check createEhrConnectors();

# The reference lab's FHIR server.
final fhir:FHIRConnector labFhir = check new (fhirConnectorConfig(labFhirBaseUrl, ()));

isolated function createEhrConnectors() returns map<fhir:FHIRConnector>|error {
    map<fhir:FHIRConnector> connectors = {};
    foreach EhrSystemConfig ehr in ehrSystems {
        connectors[ehr.id] = check new (fhirConnectorConfig(ehr.fhirBaseUrl, ehr.auth));
    }
    return connectors;
}

# The FHIR connector of one EHR.
#
# + ehr - the EHR id
# + return - its connector, or an error for an EHR that is not configured
isolated function ehrClient(string ehr) returns fhir:FHIRConnector|error {
    lock {
        fhir:FHIRConnector? connector = ehrConnectors[ehr];
        if connector is fhir:FHIRConnector {
            return connector;
        }
    }
    return error(string `Unknown EHR "${ehr}"`);
}

# The configuration of one EHR.
#
# + ehr - the EHR id
# + return - its configuration, or an error for an EHR that is not configured
isolated function ehrSystem(string ehr) returns EhrSystemConfig|error {
    foreach EhrSystemConfig system in ehrSystems {
        if system.id == ehr {
            return system;
        }
    }
    return error(string `Unknown EHR "${ehr}"`);
}

# Display name of an EHR, for the timeline; the id itself when it is not configured.
#
# + ehr - the EHR id
# + return - the EHR's display name
isolated function ehrName(string ehr) returns string {
    EhrSystemConfig|error system = ehrSystem(ehr);
    return system is EhrSystemConfig ? system.displayName : ehr;
}

isolated function fhirConnectorConfig(string baseUrl, OAuthClientConfig? auth) returns fhir:FHIRConnectorConfig {
    fhir:FHIRConnectorConfig config = {
        baseURL: baseUrl,
        mimeType: fhir:FHIR_JSON,
        // wso2/fhir-server (Go net/http) speaks HTTP/1.1 on plain connections.
        httpVersion: http:HTTP_1_1,
        timeout: 30
    };
    if auth is OAuthClientConfig {
        config.authConfig = {
            tokenUrl: auth.tokenUrl,
            clientId: auth.clientId,
            clientSecret: auth.clientSecret,
            scopes: auth.scopes
        };
    }
    return config;
}

// ── Integration database ──
// Holds the agents' conversation memory and the assessment read model the portal queries.
// Workflow state itself lives in Temporal; this is a projection of it for the UI.

# The integration's Postgres database.
final postgresql:Client db = check new (
    host = dbHost, port = dbPort, username = dbUser, password = dbPassword, database = dbName,
    connectionPool = {maxOpenConnections: 10, minIdleConnections: 2}
);

// ── Demo controls ──

# Toxiproxy's admin API: the presenter's outage switches enable and disable its proxies.
final http:Client toxiproxy = check new (toxiproxyUrl, {timeout: 5, httpVersion: http:HTTP_1_1});
