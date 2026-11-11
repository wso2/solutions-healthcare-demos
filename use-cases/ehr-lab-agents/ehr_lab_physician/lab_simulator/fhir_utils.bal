import ballerina/log;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;
import ballerinax/health.fhir.r4.parser;

// Typed access to the lab's FHIR server with the Ballerina FHIR library: what is read is parsed into its FHIR R4
// record (ballerinax/health.fhir.r4.international401) with the library's parser as it arrives; what is written is
// built as one — so a misspelt element or a wrong datatype fails the build rather than the lab server — and
// serialised with the library's serializers.

# Canonical URL prefix of the base FHIR R4 profiles.
const string BASE_PROFILE = "http://hl7.org/fhir/StructureDefinition/";

# Parses one FHIR resource with the FHIR library's parser into its `international401` record (or `r4:Bundle`),
# against the base profile of its type. Left to itself the parser picks a profile from the payload's
# `meta.profile` or the first one registered for the type (for Observation, the BMI vital-sign profile).
#
# + payload - the resource as FHIR JSON
# + return - the typed resource, or an error if it is not a valid resource of its type
isolated function parseFhir(json payload) returns anydata|error {
    // Normalise first: JSON handed between workflow activities arrives with `anydata`-typed nested values, which
    // the parser would not recognise as JSON (and would try to read as XML).
    json fhirJsonPayload = payload.toJson();
    json|error resourceType = fhirJsonPayload.resourceType;
    if resourceType !is string {
        return error("Not a FHIR resource: it has no resourceType");
    }
    return parser:parse(fhirJsonPayload, targetProfile = BASE_PROFILE + resourceType);
}

# Serialises a FHIR record with the FHIR library's serializers: the Bundle serializer for a Bundle, the
# resource serializer for anything else.
#
# + fhirResource - an `international401` resource or an `r4:Bundle`
# + return - the FHIR JSON, or an error if the value is not a FHIR resource the library knows
isolated function fhirJson(anydata fhirResource) returns json|error {
    if fhirResource is r4:Bundle {
        r4:FHIRWireFormat? wire = check r4:fhirBundleJsonSerializer(fhirResource);
        return wire is json ? wire : error("The Bundle serializer returned no JSON");
    }
    return r4:executeResourceJsonSerializer(fhirResource);
}

# Reads one resource from the lab's FHIR server and parses it.
#
# + resourceType - the FHIR resource type, e.g. `Patient`
# + id - the resource id
# + return - the typed resource, or an error if it cannot be read or parsed
isolated function readResource(string resourceType, string id) returns anydata|error {
    fhir:FHIRResponse response = check labFhir->getById(resourceType, id);
    return parseFhir(<json>response.'resource);
}

# Reads an order.
#
# + id - the ServiceRequest id
# + return - the ServiceRequest, or an error if it cannot be read or is not a valid ServiceRequest
isolated function readServiceRequest(string id) returns international401:ServiceRequest|error =>
    (check readResource("ServiceRequest", id)).ensureType();

# Reads a patient.
#
# + id - the Patient id
# + return - the Patient, or an error if it cannot be read or is not a valid Patient
isolated function readPatient(string id) returns international401:Patient|error =>
    (check readResource("Patient", id)).ensureType();

# Reads a specimen.
#
# + id - the Specimen id
# + return - the Specimen, or an error if it cannot be read or is not a valid Specimen
isolated function readSpecimen(string id) returns international401:Specimen|error =>
    (check readResource("Specimen", id)).ensureType();

# Reads a report.
#
# + id - the DiagnosticReport id
# + return - the DiagnosticReport, or an error if it cannot be read or is not a valid DiagnosticReport
isolated function readDiagnosticReport(string id) returns international401:DiagnosticReport|error =>
    (check readResource("DiagnosticReport", id)).ensureType();

# Runs a search on the lab's FHIR server.
#
# + resourceType - the type to search
# + params - search parameters
# + return - the searchset Bundle, parsed, or an error if the search fails
isolated function searchBundle(string resourceType, map<string[]> params) returns r4:Bundle|error {
    fhir:FHIRResponse response = check labFhir->search(resourceType, searchParameters = params);
    return (check parseFhir(<json>response.'resource)).ensureType();
}

# Submits a transaction to the lab's FHIR server.
#
# + entries - the transaction's entries, each with its request
# + return - the transaction-response Bundle, parsed, or an error if the server rejects the transaction
isolated function submitTransaction(r4:BundleEntry[] entries) returns r4:Bundle|error {
    r4:Bundle request = {'type: "transaction", entry: entries};
    fhir:FHIRResponse response = check labFhir->'transaction(check fhirJson(request));
    return (check parseFhir(<json>response.'resource)).ensureType();
}

# The resources of one type in a Bundle, each parsed with the FHIR library; any that do not parse are skipped.
#
# + bundle - the Bundle
# + resourceType - the type to keep
# + return - the parsed resources, in bundle order (narrow them with `is`)
isolated function resourcesOfType(r4:Bundle bundle, string resourceType) returns anydata[] {
    anydata[] matches = [];
    foreach r4:BundleEntry entry in bundle.entry ?: [] {
        anydata value = entry?.'resource;
        if value is map<anydata> && value["resourceType"] == resourceType {
            anydata|error parsed = parseFhir(value.toJson());
            if parsed is error {
                log:printWarn("Skipping a FHIR resource that does not parse", parsed, resourceType = resourceType);
            } else {
                matches.push(parsed);
            }
        }
    }
    return matches;
}

# The tests on an order, read from the lab test codings in `orderDetail`.
#
# + serviceRequest - the ServiceRequest
# + return - the ordered tests; empty if none use the lab's test code system
isolated function orderedTests(international401:ServiceRequest serviceRequest) returns OrderedTest[] {
    OrderedTest[] tests = [];
    foreach r4:CodeableConcept detail in serviceRequest.orderDetail ?: [] {
        foreach r4:Coding coding in detail.coding ?: [] {
            string? code = coding.code;
            if coding.system == LAB_TEST_CODE_SYSTEM && code is string {
                tests.push({code, name: coding.display ?: code});
            }
        }
    }
    return tests;
}

# The value of an identifier in a given system.
#
# + identifiers - the resource's identifiers
# + system - the identifier system
# + return - the identifier value, or nil if there is none in that system
isolated function identifierValue(r4:Identifier[]? identifiers, string system) returns string? {
    foreach r4:Identifier identifier in identifiers ?: [] {
        if identifier.system == system {
            return identifier.value;
        }
    }
    return ();
}

# The patient's medical record number. Lab patients are registered by the integration with one
# identifier — the MRN from their own EHR, in that EHR's identifier system.
#
# + patient - the Patient
# + return - the MRN, or nil if the patient has none
isolated function mrnOf(international401:Patient patient) returns string? {
    r4:Identifier[] identifiers = patient.identifier ?: [];
    return identifiers.length() > 0 ? identifiers[0].value : ();
}

# The patient's display name: the first name's text, else its given and family names.
#
# + patient - the Patient
# + return - the name, or `Unknown` if the patient has none
isolated function humanName(international401:Patient patient) returns string {
    r4:HumanName[] names = patient.name ?: [];
    if names.length() == 0 {
        return "Unknown";
    }
    string? text = names[0].text;
    if text is string {
        return text;
    }
    string[] parts = [...names[0].given ?: []];
    string? family = names[0].family;
    if family is string {
        parts.push(family);
    }
    return parts.length() > 0 ? string:'join(" ", ...parts) : "Unknown";
}

# The id part of a relative reference.
#
# + reference - a reference such as `Patient/123`
# + return - the id, e.g. `123`; the whole string if it has no `/`
isolated function referenceId(string reference) returns string =>
    reference.substring((reference.lastIndexOf("/") ?: -1) + 1);

# Whether a report is based on the given order.
#
# + report - the DiagnosticReport
# + serviceRequestId - the lab's ServiceRequest id
# + return - true if one of the report's `basedOn` references points at the order
isolated function basedOnContains(international401:DiagnosticReport report, string serviceRequestId) returns boolean {
    foreach r4:Reference ref in report.basedOn ?: [] {
        string? reference = ref.reference;
        if reference is string && reference.endsWith("ServiceRequest/" + serviceRequestId) {
            return true;
        }
    }
    return false;
}

# The id assigned to one entry of a transaction, read from its `location`.
#
# + transactionResponse - the transaction-response Bundle
# + index - position of the entry in the request bundle (responses keep request order)
# + resourceType - the entry's resource type
# + return - the id, or an error if the response has no usable location at that position
isolated function idAtEntry(r4:Bundle transactionResponse, int index, string resourceType) returns string|error {
    r4:BundleEntry[] entries = transactionResponse.entry ?: [];
    if entries.length() <= index {
        return error(string `Transaction response is missing entry ${index}`);
    }
    string? location = entries[index]?.response?.location;
    if location is () {
        return error(string `Transaction response has no location for entry ${index}`);
    }
    string[] parts = re `/`.split(location);
    foreach int i in 0 ..< parts.length() - 1 {
        if parts[i] == resourceType {
            return parts[i + 1];
        }
    }
    return error(string `Cannot read the ${resourceType} id from "${location}"`);
}
