import ballerina/http;
import ballerina/log;
import ballerina/time;
import ballerina/uuid;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

// The lab tells the ordering integration what happened with FHIR R4 messages: a Bundle of type `message`
// whose first entry is a MessageHeader naming the event, followed by the resources the event is about, as
// the lab's FHIR server holds them. Each is POSTed to the integration's FHIR `$process-message` operation.
//
//   specimen-collected   focus: the Specimen          entries: Specimen, ServiceRequest
//   results-ready        focus: the DiagnosticReport  entries: DiagnosticReport, its Observations, ServiceRequest

# The code system of the lab's message events.
const string LAB_EVENT_SYSTEM = "urn:demo:lab:event";
const string EVENT_SPECIMEN_COLLECTED = "specimen-collected";
const string EVENT_RESULTS_READY = "results-ready";

# A resource a lab message can carry.
type MessageResource international401:Specimen|international401:ServiceRequest|international401:DiagnosticReport
    |international401:Observation;

# Builds a FHIR message about an order.
#
# + event - the event code
# + display - the event, in words
# + focus - the resource the event is about, e.g. `Specimen/123`
# + resources - the resources the message carries, as the lab's FHIR server returned them
# + return - the message Bundle
isolated function labMessage(string event, string display, string focus, MessageResource[] resources)
        returns r4:Bundle {
    international401:MessageHeader header = {
        id: uuid:createType4AsString(),
        eventCoding: {system: LAB_EVENT_SYSTEM, code: event, display},
        sender: {reference: string `Organization/${labOrganizationId}`, display: labDisplayName},
        'source: {name: labDisplayName, endpoint: labFhirBaseUrl},
        focus: [{reference: focus}]
    };
    r4:BundleEntry[] entries = [{fullUrl: string `urn:uuid:${header.id ?: ""}`, 'resource: header}];
    foreach MessageResource resourceValue in resources {
        entries.push({
            fullUrl: string `${labFhirBaseUrl}/${resourceValue.resourceType}/${resourceValue?.id ?: ""}`,
            'resource: resourceValue
        });
    }
    return {
        id: uuid:createType4AsString(),
        'type: "message",
        timestamp: time:utcToString(time:utcNow()),
        entry: entries
    };
}

# Sends a FHIR message to the integration. A failure is logged, not raised: the lab's records are already
# filed, and the integration's fallback poller will find them.
#
# + event - the event code, for the log
# + message - the message Bundle
# + return - whether the integration accepted the message
isolated function notifyIntegration(string event, r4:Bundle message) returns boolean {
    json|error messageJson = fhirJson(message);
    if messageJson is error {
        log:printError("Could not serialise the FHIR message", messageJson, event = event);
        return false;
    }
    http:Response|error response = integrationClient->post("", messageJson,
            {"X-Lab-Api-Key": integrationWebhookApiKey, "Accept": "application/fhir+json"},
            mediaType = "application/fhir+json");
    if response is error {
        log:printWarn("Could not notify the integration; its fallback poller will pick this up", response,
                event = event);
        return false;
    }
    if response.statusCode >= 300 {
        json|error outcome = response.getJsonPayload();
        log:printWarn("Integration refused the message", event = event, statusCode = response.statusCode,
                outcome = outcome is json ? outcome.toJsonString() : "");
        return false;
    }
    return true;
}
