import ballerina/http;
import ballerina/log;
import ballerina/time;
import ballerina/uuid;

// The lab tells the ordering integration what happened with FHIR R4 messages: a Bundle of type `message`
// whose first entry is a MessageHeader naming the event, followed by the resources the event is about, as
// the lab's FHIR server holds them.
//
//   specimen-collected   focus: the Specimen          entries: Specimen, ServiceRequest
//   results-ready        focus: the DiagnosticReport  entries: DiagnosticReport, its Observations, ServiceRequest

# The code system of the lab's message events.
const string LAB_EVENT_SYSTEM = "urn:demo:lab:event";
const string EVENT_SPECIMEN_COLLECTED = "specimen-collected";
const string EVENT_RESULTS_READY = "results-ready";

# Builds a FHIR message about an order.
#
# + event - the event code
# + display - the event, in words
# + focus - the resource the event is about, e.g. `Specimen/123`
# + resources - the resources the message carries, as the lab's FHIR server returned them
# + return - the message Bundle
isolated function labMessage(string event, string display, string focus, json[] resources) returns json {
    json[] entries = [{
        fullUrl: string `urn:uuid:${uuid:createType4AsString()}`,
        'resource: {
            resourceType: "MessageHeader",
            eventCoding: {system: LAB_EVENT_SYSTEM, code: event, display},
            sender: {reference: string `Organization/${labOrganizationId}`, display: labDisplayName},
            'source: {name: labDisplayName, endpoint: labFhirBaseUrl},
            focus: [{reference: focus}]
        }
    }];
    foreach json resourceJson in resources {
        string resourceType = resourceJson is map<json> ? resourceJson["resourceType"].toString() : "";
        string id = resourceJson is map<json> ? resourceJson["id"].toString() : "";
        entries.push({fullUrl: string `${labFhirBaseUrl}/${resourceType}/${id}`, 'resource: resourceJson});
    }
    return {
        resourceType: "Bundle",
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
isolated function notifyIntegration(string event, json message) returns boolean {
    http:Response|error response = integrationClient->post("", message, {"X-Lab-Api-Key": integrationWebhookApiKey},
            mediaType = "application/fhir+json");
    if response is error {
        log:printWarn("Could not notify the integration; its fallback poller will pick this up", response,
                event = event);
        return false;
    }
    if response.statusCode >= 300 {
        log:printWarn("Integration refused the message", event = event, statusCode = response.statusCode);
        return false;
    }
    return true;
}
