import ballerina/log;
import ballerina/uuid;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;
import ballerinax/health.fhirr4;

// The integration's own FHIR R4 API, built on the FHIR service type (ballerinax/health.fhirr4). The
// listener validates each request as FHIR before the resource function runs (content type, the operation
// and its scope) and turns a returned `r4:FHIRError` into an OperationOutcome with its HTTP status.
//
//   POST /fhir/r4/$process-message           the lab's FHIR messages (specimen collected, results ready)
//   GET  /fhir/r4/Patient/{id}/$summary      the patient's International Patient Summary
//
// Both services share Ballerina's default HTTP listener with the portal API (`/api`, main.bal), so the
// integration serves everything on one port (9090; `[ballerina.http] defaultListenerPort` changes it).

# The lab's messaging endpoint: FHIR's `$process-message`, a system-level operation of MessageHeader.
final r4:ResourceAPIConfig messagingApiConfig = {
    resourceType: "MessageHeader",
    profiles: ["http://hl7.org/fhir/StructureDefinition/MessageHeader"],
    defaultProfile: (),
    searchParameters: [],
    operations: [{name: "process-message", active: true}],
    serverConfig: (),
    authzConfig: ()
};

# The patient summary: `Patient/[id]/$summary`, the IPS operation at instance level.
final r4:ResourceAPIConfig patientSummaryApiConfig = {
    resourceType: "Patient",
    profiles: ["http://hl7.org/fhir/StructureDefinition/Patient"],
    defaultProfile: (),
    searchParameters: [],
    operations: [{name: "summary", active: true, additionalProperties: {meta: {operationLevels: [{level: "instance"}]}}}],
    serverConfig: (),
    authzConfig: ()
};

# Receives the lab's FHIR messages.
service /fhir/r4 on new fhirr4:Listener((), messagingApiConfig) {

    # Processes a lab message: the lab collected the specimen for an order, or its report is ready. The
    # message is read into typed FHIR resources (lab_messages.bal) and handed to the assessment's workflow.
    #
    # + fhirContext - the FHIR request context; carries the lab's `X-Lab-Api-Key` header
    # + payload - the message Bundle as received (the FHIR service hands over the request's FHIR JSON as is; it is
    # parsed here with the FHIR library's parser)
    # + return - a response message acknowledging it, or an OperationOutcome: 401 for a wrong key, 400 for a
    # message that is not a lab message, 500 when the workflow cannot take it (the lab's fallback poller will)
    isolated resource function post \$process\-message(r4:FHIRContext fhirContext, json payload)
            returns r4:Bundle|r4:FHIRError {
        if headerValue(fhirContext, "X-Lab-Api-Key") != labWebhookApiKey {
            return r4:createFHIRError("Invalid lab API key", r4:ERROR, r4:SECURITY, httpStatusCode = 401);
        }
        anydata|error message = parseFhir(payload);
        if message !is r4:Bundle {
            string reason = message is error ? message.message() : "The message is not a Bundle";
            log:printWarn("Refused a lab message", reason = reason);
            return r4:createFHIRError(reason, r4:ERROR, r4:INVALID, httpStatusCode = 400);
        }
        SpecimenCollectedMessage|ResultsReadyMessage|error parsed = parseLabMessage(message);
        if parsed is error {
            log:printWarn("Refused a lab message", parsed);
            return r4:createFHIRError(parsed.message(), r4:ERROR, r4:INVALID, httpStatusCode = 400);
        }
        string event = parsed is SpecimenCollectedMessage ? EVENT_SPECIMEN_COLLECTED : EVENT_RESULTS_READY;
        boolean|error handled = parsed is SpecimenCollectedMessage
            ? completeLabVisit(parsed.serviceRequestId, parsed.specimen, "lab webhook")
            : signalLabResult(parsed.serviceRequestId, parsed.report, parsed.observations, "lab webhook");
        if handled is error {
            log:printError("Lab message could not be processed", handled, serviceRequestId = parsed.serviceRequestId,
                    event = event);
            return r4:createFHIRError("The lab message could not be processed", r4:ERROR, r4:TRANSIENT_EXCEPTION,
                    diagnostic = handled.message(), cause = handled, httpStatusCode = 500);
        }
        log:printInfo("Lab message processed", event = event, serviceRequestId = parsed.serviceRequestId,
                movedWorkflow = handled);
        return messageResponse(parsed.header, handled);
    }
}

# Serves the International Patient Summary of the clinic's EHR patients.
service /fhir/r4/Patient on new fhirr4:Listener((), patientSummaryApiConfig) {

    # The patient's IPS, as a FHIR document Bundle, built from the EHR record (summary.bal): the same document
    # the portal shows, with the clinic's flags and care gaps.
    #
    # + id - the patient's id in the clinic's EHR
    # + fhirContext - the FHIR request context
    # + return - the IPS document, or an OperationOutcome: 404 for an unknown patient, 502 if the EHR cannot be read
    isolated resource function get [string id]/\$summary(r4:FHIRContext fhirContext) returns r4:Bundle|r4:FHIRError {
        EhrSystemConfig|error system = clinicEhr();
        if system is error {
            return r4:createFHIRError(system.message(), r4:ERROR, r4:PROCESSING, httpStatusCode = 500);
        }
        EhrRecord|error ehrRecord = fetchEhrRecord(system.id, id);
        if ehrRecord is error {
            if httpStatusOf(ehrRecord) == 404 {
                return r4:createFHIRError(string `Patient/${id} not found`, r4:ERROR, r4:PROCESSING_NOT_FOUND,
                        httpStatusCode = 404);
            }
            log:printError("IPS: the EHR could not be read", ehrRecord, patientId = id);
            return r4:createFHIRError(string `${system.displayName} could not be read`, r4:ERROR,
                    r4:TRANSIENT_EXCEPTION, diagnostic = describeError(ehrRecord), httpStatusCode = 502);
        }
        return buildSummary(system, ehrRecord);
    }
}

# The response message to a lab message: a `message` Bundle whose MessageHeader names the request it
# answers, as FHIR messaging asks.
#
# + request - the lab's MessageHeader
# + movedWorkflow - whether the message moved the assessment's workflow on (false for a repeat)
# + return - the response message
isolated function messageResponse(international401:MessageHeader request, boolean movedWorkflow) returns r4:Bundle {
    international401:MessageHeader header = {
        id: uuid:createType4AsString(),
        eventCoding: request.eventCoding,
        'source: {name: "EHR + Lab integration", endpoint: "urn:demo:longevity:integration"},
        destination: [{name: request.'source.name, endpoint: request.'source.endpoint}],
        response: {identifier: request.id ?: "", code: "ok"},
        text: {status: "generated", div: string `<div xmlns="http://www.w3.org/1999/xhtml">${movedWorkflow
            ? "Processed" : "Already processed"}</div>`}
    };
    return {
        id: uuid:createType4AsString(),
        'type: "message",
        timestamp: nowIso(),
        entry: [{fullUrl: string `urn:uuid:${header.id ?: ""}`, 'resource: header}]
    };
}

# The EHR the FHIR API serves: the clinic's EHR, the first configured.
#
# + return - its configuration, or an error when none is configured
isolated function clinicEhr() returns EhrSystemConfig|error =>
    ehrSystems.length() > 0 ? ehrSystems[0] : error("No EHR is configured");

# A request header, matched case-insensitively.
#
# + fhirContext - the FHIR request context
# + name - the header name
# + return - its first value, or nil when the request does not carry it
isolated function headerValue(r4:FHIRContext fhirContext, string name) returns string? {
    r4:HTTPRequest? request = fhirContext.getHTTPRequest();
    if request is () {
        return ();
    }
    foreach [string, string[]] [key, values] in request.headers.entries() {
        if key.equalsIgnoreCaseAscii(name) && values.length() > 0 {
            return values[0];
        }
    }
    return ();
}

# The HTTP status a FHIR server answered with, found in an error's cause chain.
#
# + err - the error
# + return - the status, or nil when the error holds no FHIR server error
isolated function httpStatusOf(error err) returns int? {
    error? current = err;
    while current is error {
        if current is fhir:FHIRServerError {
            return current.detail().httpStatusCode;
        }
        current = current.cause();
    }
    return ();
}
