import care_loop/care_loop_common as common;
import ballerina/http;
import ballerinax/health.clients.fhir;

final fhir:FHIRConnector fhirConnector = check common:newFhirConnector(fhirServerUrl);
final fhir:FHIRConnector ehrFhirConnector = check common:newFhirConnector(ehrFhirServerUrl);

// uvicorn (like Bun in care-loop-collector-service/clients.bal) doesn't answer the default HTTP_2_0 h2c upgrade probe; pinning HTTP_1_1 avoids it.
final http:Client heartRiskClient = check new (heartRiskServiceUrl, httpVersion = http:HTTP_1_1);
final http:Client aiClient = check new (aiServiceUrl);
final http:Client collectorClient = check new (collectorServiceUrl);
final http:Client dashboardEventsClient = check common:newDashboardEventsClient(dashboardEventsUrl);

// Fire-and-forget: the ops dashboard is a nice-to-have live feed, never a reason to slow down or fail real pipeline work.
isolated function notifyDashboard(string patientId, common:DashboardEventLabel label, string? detail = (), map<string>? payload = ()) {
    common:notifyDashboard(dashboardEventsClient, patientId, label, detail, payload);
}
