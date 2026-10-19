import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// The lab notifies the integration with FHIR R4 messages: a Bundle of type `message` whose MessageHeader
// names the event, followed by the resources the event is about.
//
//   specimen-collected   focus: the Specimen          entries: Specimen, ServiceRequest
//   results-ready        focus: the DiagnosticReport  entries: DiagnosticReport, its Observations, ServiceRequest
//
// The resources are read into their FHIR R4 types here, so a malformed message is refused at the door.

# The code system of the lab's message events.
const string LAB_EVENT_SYSTEM = "urn:demo:lab:event";
const string EVENT_SPECIMEN_COLLECTED = "specimen-collected";
const string EVENT_RESULTS_READY = "results-ready";

# The lab collected the specimen for an order.
#
# + serviceRequestId - the lab's order
# + specimen - the Specimen the lab filed
type SpecimenCollectedMessage record {|
    string serviceRequestId;
    international401:Specimen specimen;
|};

# The lab's report for an order is ready.
#
# + serviceRequestId - the lab's order
# + report - the lab's DiagnosticReport
# + observations - the Observations the report references
type ResultsReadyMessage record {|
    string serviceRequestId;
    international401:DiagnosticReport report;
    international401:Observation[] observations;
|};

# Reads a lab message into typed FHIR resources.
#
# + message - the message Bundle as received
# + return - the event and its resources, or an error if this is not a lab message this integration understands
isolated function parseLabMessage(json message) returns SpecimenCollectedMessage|ResultsReadyMessage|error {
    if message !is map<json> || message["resourceType"] != "Bundle" || message["type"] != "message" {
        return error("Expected a FHIR Bundle of type \"message\"");
    }
    international401:MessageHeader header = check (check onlyResource(message, "MessageHeader")).cloneWithType();
    r4:Coding? eventCoding = header.eventCoding;
    if eventCoding is () || eventCoding.system != LAB_EVENT_SYSTEM {
        return error(string `The MessageHeader has no event from ${LAB_EVENT_SYSTEM}`);
    }
    international401:ServiceRequest serviceRequest =
        check (check onlyResource(message, "ServiceRequest")).cloneWithType();
    string? serviceRequestId = serviceRequest.id;
    if serviceRequestId is () {
        return error("The message's ServiceRequest has no id");
    }
    match eventCoding.code {
        EVENT_SPECIMEN_COLLECTED => {
            international401:Specimen specimen = check (check onlyResource(message, "Specimen")).cloneWithType();
            return {serviceRequestId, specimen};
        }
        EVENT_RESULTS_READY => {
            international401:DiagnosticReport report =
                check (check onlyResource(message, "DiagnosticReport")).cloneWithType();
            international401:Observation[] observations = <international401:Observation[]>check typedResources(
                    resourcesOfType(message, "Observation"), ObservationList);
            return {serviceRequestId, report, observations};
        }
    }
    return error(string `Unknown lab event "${eventCoding.code ?: ""}"`);
}

# The one resource of a type in a Bundle.
#
# + bundle - the Bundle
# + resourceType - the resource type
# + return - the resource, or an error when the Bundle has none or several
isolated function onlyResource(json bundle, string resourceType) returns json|error {
    json[] matches = resourcesOfType(bundle, resourceType);
    if matches.length() != 1 {
        return error(string `Expected one ${resourceType} in the lab message, found ${matches.length()}`);
    }
    return matches[0];
}
