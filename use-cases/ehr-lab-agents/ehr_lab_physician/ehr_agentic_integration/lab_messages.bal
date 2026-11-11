import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// The lab notifies the integration with FHIR R4 messages: a Bundle of type `message` whose MessageHeader
// names the event, followed by the resources the event is about.
//
//   specimen-collected   focus: the Specimen          entries: Specimen, ServiceRequest
//   results-ready        focus: the DiagnosticReport  entries: DiagnosticReport, its Observations, ServiceRequest
//
// The messages arrive at the integration's FHIR `$process-message` operation (fhir_api.bal). The resources
// are read into their FHIR R4 types here, so a malformed message is refused at the door.

# The code system of the lab's message events.
const string LAB_EVENT_SYSTEM = "urn:demo:lab:event";
const string EVENT_SPECIMEN_COLLECTED = "specimen-collected";
const string EVENT_RESULTS_READY = "results-ready";

# The lab collected the specimen for an order.
#
# + header - the message's MessageHeader
# + serviceRequestId - the lab's order
# + specimen - the Specimen the lab filed
type SpecimenCollectedMessage record {|
    international401:MessageHeader header;
    string serviceRequestId;
    international401:Specimen specimen;
|};

# The lab's report for an order is ready.
#
# + header - the message's MessageHeader
# + serviceRequestId - the lab's order
# + report - the lab's DiagnosticReport
# + observations - the Observations the report references
type ResultsReadyMessage record {|
    international401:MessageHeader header;
    string serviceRequestId;
    international401:DiagnosticReport report;
    international401:Observation[] observations;
|};

# Reads a lab message into typed FHIR resources.
#
# + message - the message Bundle, as the FHIR service received it
# + return - the event and its resources, or an error if this is not a lab message this integration understands
isolated function parseLabMessage(r4:Bundle message) returns SpecimenCollectedMessage|ResultsReadyMessage|error {
    if message.'type != "message" {
        return error("Expected a FHIR Bundle of type \"message\"");
    }
    r4:BundleEntry[] entries = message.entry ?: [];
    if entries.length() == 0 || bundleEntryType(entries[0]) != "MessageHeader" {
        return error("A FHIR message starts with its MessageHeader");
    }
    international401:MessageHeader header = check (check parseFhir(check onlyResource(message, "MessageHeader"))).ensureType();
    r4:Coding? eventCoding = header.eventCoding;
    if eventCoding is () || eventCoding.system != LAB_EVENT_SYSTEM {
        return error(string `The MessageHeader has no event from ${LAB_EVENT_SYSTEM}`);
    }
    international401:ServiceRequest serviceRequest =
        check (check parseFhir(check onlyResource(message, "ServiceRequest"))).ensureType();
    string? serviceRequestId = serviceRequest.id;
    if serviceRequestId is () {
        return error("The message's ServiceRequest has no id");
    }
    match eventCoding.code {
        EVENT_SPECIMEN_COLLECTED => {
            international401:Specimen specimen = check (check parseFhir(check onlyResource(message, "Specimen"))).ensureType();
            return {header, serviceRequestId, specimen};
        }
        EVENT_RESULTS_READY => {
            international401:DiagnosticReport report =
                check (check parseFhir(check onlyResource(message, "DiagnosticReport"))).ensureType();
            international401:Observation[] observations = from anydata r in parseResources(bundleResources(message, "Observation"))
                where r is international401:Observation
                select r;
            return {header, serviceRequestId, report, observations};
        }
    }
    return error(string `Unknown lab event "${eventCoding.code ?: ""}"`);
}

# The one resource of a type in a Bundle.
#
# + bundle - the Bundle
# + resourceType - the resource type
# + return - the resource, or an error when the Bundle has none or several
isolated function onlyResource(r4:Bundle bundle, string resourceType) returns json|error {
    json[] matches = bundleResources(bundle, resourceType);
    if matches.length() != 1 {
        return error(string `Expected one ${resourceType} in the lab message, found ${matches.length()}`);
    }
    return matches[0];
}

# The resources of a type in a typed Bundle, as json ready to be read as their FHIR type.
#
# + bundle - the Bundle
# + resourceType - the resource type to keep
# + return - the matching resources as FHIR JSON, in bundle order, ready for `parseFhir`
isolated function bundleResources(r4:Bundle bundle, string resourceType) returns json[] =>
    from r4:BundleEntry entry in bundle.entry ?: []
    where bundleEntryType(entry) == resourceType
    select (<anydata>entry?.'resource).toJson();

# The resource type of a Bundle entry.
#
# + entry - the entry
# + return - its resource's `resourceType`, or nil when the entry has no resource
isolated function bundleEntryType(r4:BundleEntry entry) returns string? {
    anydata value = entry?.'resource;
    if value is map<anydata> {
        anydata resourceType = value["resourceType"];
        return resourceType is string ? resourceType : ();
    }
    return ();
}
