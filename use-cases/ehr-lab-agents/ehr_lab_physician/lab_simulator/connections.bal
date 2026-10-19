import ballerina/http;
import ballerinax/health.clients.fhir;

# The lab's FHIR server. The simulator keeps no state of its own: this server is the record.
final fhir:FHIRConnector labFhir = check new ({
    baseURL: labFhirBaseUrl,
    mimeType: fhir:FHIR_JSON,
    httpVersion: http:HTTP_1_1,
    timeout: 30
});

# The ordering integration's "report ready" webhook.
final http:Client integrationClient = check new (integrationWebhookUrl, {timeout: 15, httpVersion: http:HTTP_1_1});
