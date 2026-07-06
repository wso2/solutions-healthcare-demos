import ballerina/http;
import ballerina/lang.runtime;
import ballerina/log;
import ballerinax/health.clients.fhir;

// Capability-statement validation would GET /metadata at construction time, racing this service's own startup against care-loop-fhir-server's - disabled.
final fhir:FHIRConnector fhirConnector = check new ({baseURL: fhirServerUrl}, enableCapabilityStatementValidation = false);
final http:Client aiClient = check new (aiServiceUrl);

// http:Client defaults to HTTP_2_0, which probes with an h2c upgrade that Bun's HTTP server resets the connection on instead of answering - pinning HTTP_1_1 avoids it (verified 0/50 failures vs 50/50 before).
final http:Client whatsappClient = check new (whatsappUrl, httpVersion = http:HTTP_1_1);

const MAX_RETRIES = 3;

// Retry is defense-in-depth for startup-ordering races (DNS/connection-refused), not the HTTP/2 issue above, which the httpVersion pin already fixes deterministically.
isolated function postWithRetry(http:Client 'client, string path, json body, typedesc<anydata> targetType)
        returns anydata|http:ClientError {
    http:ClientError lastError = error("unreachable");
    foreach int attempt in 0 ..< MAX_RETRIES {
        anydata|http:ClientError response = 'client->post(path, body, targetType = targetType);
        if response !is http:ClientError {
            return response;
        }
        lastError = response;
        if attempt < MAX_RETRIES - 1 {
            log:printWarn("POST failed, retrying", path = path, attempt = attempt, 'error = response);
            runtime:sleep(0.5);
        }
    }
    return lastError;
}
