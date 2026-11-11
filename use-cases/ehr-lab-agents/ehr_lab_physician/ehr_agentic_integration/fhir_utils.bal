import ballerina/log;
import ballerina/time;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.parser;

const int SEARCH_PAGE_SIZE = 200;
const int SEARCH_MAX_PAGES = 5;

# Runs a FHIR search and returns every matching resource of `resourceType`, following `next`
# links for a few pages. Included resources (`_include`) of other types are dropped.
#
# + connector - the system to search
# + resourceType - resource type to search and keep
# + params - search parameters
# + return - matching resources as json, or an error if the first page fails
isolated function searchResources(fhir:FHIRConnector connector, string resourceType, map<string[]> params)
        returns json[]|error {
    // A fresh map: `clone()` of a read-only map (as passed to a `start`ed search) is that same read-only map.
    // Iterates keys(), not entries(): entries() on a read-only map shared by concurrent strands
    // intermittently fails with "modification not allowed on readonly value" (2201.14.1).
    map<string[]> query = {};
    foreach string name in params.keys() {
        query[name] = [...params.get(name)];
    }
    if !query.hasKey("_count") {
        query["_count"] = [SEARCH_PAGE_SIZE.toString()];
    }
    fhir:FHIRResponse page = check connector->search(resourceType, searchParameters = query);
    json[] resources = resourcesOfType(<json>page.'resource, resourceType);
    int pages = 1;
    while pages < SEARCH_MAX_PAGES {
        fhir:FHIRResponse|fhir:FHIRError? next = connector->nextBundle(page);
        if next is () {
            break;
        }
        if next is fhir:FHIRError {
            log:printWarn("Stopped paging a FHIR search", next, resourceType = resourceType);
            break;
        }
        page = next;
        resources.push(...resourcesOfType(<json>page.'resource, resourceType));
        pages += 1;
    }
    return resources;
}

# The `entry.resource` values of the given type in a Bundle.
#
# + bundle - the Bundle as json
# + resourceType - resource type to keep
# + return - the matching resources, or an empty list when the Bundle has no entries
isolated function resourcesOfType(json bundle, string resourceType) returns json[] {
    json[] matches = [];
    json|error entries = bundle.entry;
    if entries !is json[] {
        return matches;
    }
    foreach json entry in entries {
        json|error resourceValue = entry.'resource;
        if resourceValue is map<json> && resourceValue["resourceType"] == resourceType {
            matches.push(resourceValue);
        }
    }
    return matches;
}

// ── Parsing and serialising: the Ballerina FHIR library's own functions ──
//
// Everything read from a FHIR server (or received from one) is parsed with `parser:parse` into its
// `international401` record, and everything sent is serialised with the library's JSON serializers
// (`r4:executeResourceJsonSerializer`, `r4:fhirBundleJsonSerializer`). The parser is always given the base
// profile of the resource's type: left to itself it picks a profile from the payload's `meta.profile` (which
// fails for a vendor profile it does not know) or the first one registered for the type (for Observation that
// is the BMI vital-sign profile, which rejects a lab result).

# Canonical URL prefix of the base FHIR R4 profiles.
const string BASE_PROFILE = "http://hl7.org/fhir/StructureDefinition/";

# Parses one FHIR resource into its `international401` record (or `r4:Bundle`), against the base profile of its type.
#
# + payload - the resource as FHIR JSON
# + return - the typed resource (narrow it with `ensureType`), or an error if it is not a valid resource of its type
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

# Parses FHIR resources, skipping and logging any that do not parse. One malformed resource from an
# upstream system should not sink a whole patient summary.
#
# + resources - the resources as FHIR JSON
# + return - the resources that parsed, typed, in order; narrow them with `is` (e.g. `international401:Condition`)
isolated function parseResources(json[] resources) returns anydata[] {
    anydata[] parsed = [];
    foreach json resourceJson in resources {
        anydata|error typed = parseFhir(resourceJson);
        if typed is error {
            log:printWarn("Skipping a FHIR resource that does not parse", typed,
                    fhirResource = string `${jsonText(resourceJson, "resourceType") ?: "?"}/${jsonText(resourceJson, "id") ?: ""}`);
            continue;
        }
        parsed.push(typed);
    }
    return parsed;
}

# Serialises a FHIR record to FHIR JSON with the library's serializer: the Bundle serializer for a Bundle,
# the resource serializer for anything else.
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

# The resources of one type in a Bundle, parsed.
#
# + bundle - the Bundle as FHIR JSON
# + resourceType - the type to keep
# + return - the resources that parsed, in bundle order
isolated function parsedEntries(json bundle, string resourceType) returns anydata[] =>
    parseResources(resourcesOfType(bundle, resourceType));

# The logical id the server assigned to a created resource: from the returned body when the server
# sent a representation, otherwise from the Location header.
#
# + response - the server's response to a create
# + return - the new resource's id, or an error if the server returned neither a body id nor a location
isolated function createdId(fhir:FHIRResponse response) returns string|error {
    json body = <json>response.'resource;
    if body is map<json> && body["id"] is string {
        return <string>body["id"];
    }
    foreach [string, string] [name, value] in response.serverResponseHeaders.entries() {
        if name.toLowerAscii() == "location" || name.toLowerAscii() == "content-location" {
            return idFromLocation(value);
        }
    }
    return error("The server did not return the id of the created resource");
}

# `Patient/123/_history/1` or a full URL → `123`.
#
# + location - a resource reference or location URL
# + return - the resource id, or an error if the location holds none
isolated function idFromLocation(string location) returns string|error {
    string[] parts = re `/`.split(location);
    foreach int i in 0 ..< parts.length() - 1 {
        if parts[i + 1].length() > 0 && parts[i].length() > 0 && parts[i][0] >= "A" && parts[i][0] <= "Z"
                && parts[i] != "_history" {
            return parts[i + 1];
        }
    }
    return error(string `Cannot read a resource id from location "${location}"`);
}

# Ids assigned to each entry of a transaction, in request order, from the response Bundle.
#
# + responseBundle - the transaction-response Bundle
# + return - one id per entry (empty when an entry has neither a location nor a resource id), or an
# error if the Bundle has no entries
isolated function transactionIds(r4:Bundle responseBundle) returns string[]|error {
    r4:BundleEntry[] entries = responseBundle.entry ?: [];
    if entries.length() == 0 {
        return error("Transaction response has no entries");
    }
    string[] ids = [];
    foreach r4:BundleEntry entry in entries {
        string? location = entry?.response?.location;
        if location is string {
            ids.push(check idFromLocation(location));
        } else {
            anydata value = entry?.'resource;
            anydata id = value is map<anydata> ? value["id"] : ();
            ids.push(id is string ? id : "");
        }
    }
    return ids;
}

// ── Small readers over FHIR datatypes ──

isolated function codingCode(r4:CodeableConcept? concept, string system) returns string? {
    foreach r4:Coding coding in concept?.coding ?: [] {
        if coding.system == system {
            return coding.code;
        }
    }
    return ();
}

isolated function conceptText(r4:CodeableConcept? concept) returns string? {
    if concept is () {
        return ();
    }
    string? text = concept.text;
    if text is string && text.length() > 0 {
        return text;
    }
    foreach r4:Coding coding in concept.coding ?: [] {
        string? display = coding.display;
        if display is string {
            return display;
        }
    }
    return ();
}

isolated function patientName(r4:HumanName[]? names) returns string {
    if names is () || names.length() == 0 {
        return "Unknown patient";
    }
    r4:HumanName name = names[0];
    string? text = name.text;
    if text is string {
        return text;
    }
    string[] parts = [...(name.given ?: [])];
    string? family = name.family;
    if family is string {
        parts.push(family);
    }
    return string:'join(" ", ...parts);
}

isolated function identifierValue(r4:Identifier[]? identifiers, string system) returns string? {
    foreach r4:Identifier identifier in identifiers ?: [] {
        if identifier.system == system {
            return identifier.value;
        }
    }
    return ();
}

isolated function ageFrom(string? birthDate) returns int? {
    if birthDate is () || birthDate.length() < 10 {
        return ();
    }
    int|error year = int:fromString(birthDate.substring(0, 4));
    int|error month = int:fromString(birthDate.substring(5, 7));
    int|error day = int:fromString(birthDate.substring(8, 10));
    if year is error || month is error || day is error {
        return ();
    }
    time:Civil today = time:utcToCivil(time:utcNow());
    int age = today.year - year;
    if today.month < month || (today.month == month && today.day < day) {
        age -= 1;
    }
    return age;
}

isolated function nowIso() returns string => time:utcToString(time:utcNow());

isolated function dateOnly(string? dateTime) returns string? =>
    dateTime is string && dateTime.length() >= 10 ? dateTime.substring(0, 10) : dateTime;

// ── Readers over raw FHIR json (the explorer reads resources as json, so one unusual resource
// from an upstream system never hides a whole category) ──

# A string at a path in a json value, such as `["code", "text"]` or `["valueQuantity", "unit"]`.
#
# + value - the json value
# + path - field names, and array indexes as ints
# + return - the string there, or nil when the path does not lead to a string
isolated function jsonText(json value, (string|int)... path) returns string? {
    json current = value;
    foreach string|int step in path {
        if step is string && current is map<json> {
            current = current[step];
        } else if step is int && current is json[] && current.length() > step {
            current = current[step];
        } else {
            return ();
        }
    }
    if current is string {
        return current;
    }
    if current is int|decimal|float {
        return current.toString();
    }
    return ();
}

# The readable text of a CodeableConcept in json: its text, else the first coding's display or code.
#
# + concept - the CodeableConcept
# + return - the text, or nil when the concept has none
isolated function conceptLabel(json concept) returns string? {
    string? text = jsonText(concept, "text");
    if text is string && text.length() > 0 {
        return text;
    }
    return jsonText(concept, "coding", 0, "display") ?: jsonText(concept, "coding", 0, "code");
}

# A json array field, or an empty array when the field is missing.
#
# + value - the json object
# + 'field - the field name
# + return - the array
isolated function jsonArray(json value, string 'field) returns json[] {
    if value is map<json> {
        json items = value['field];
        if items is json[] {
            return items;
        }
    }
    return [];
}

# A FHIR failure as a person can read it: the server's OperationOutcome diagnostics when it sent one,
# rather than the connector's generic "FHIR server side error".
#
# + err - the error, or one whose cause chain holds the FHIR server error
# + return - the HTTP status and diagnostics, or the error's own message when it holds no server error
isolated function describeError(error err) returns string {
    error? current = err;
    while current is error {
        if current is fhir:FHIRServerError {
            json body = <json>current.detail().'resource;
            json|error issues = body.issue;
            if issues is json[] && issues.length() > 0 {
                json|error diagnostics = issues[0].diagnostics;
                if diagnostics is string {
                    return string `HTTP ${current.detail().httpStatusCode}: ${diagnostics}`;
                }
            }
            return string `HTTP ${current.detail().httpStatusCode}: ${current.message()}`;
        }
        current = current.cause();
    }
    return err.message();
}

# Creates a resource unless one with the same business identifier already exists, and returns its id
# either way. This is what makes a retried activity safe: the second attempt finds the first one's
# resource instead of creating a duplicate.
#
# Search-then-create rather than a conditional create: ballerinax/health.clients.fhir 3.0.6 sends
# `If-None-Exist` as a full URL (`<base>/<Type>?identifier=…`) where FHIR expects only the query, and
# wso2/fhir-server ignores the malformed header and creates a duplicate. An activity for one assessment
# runs one attempt at a time, so search-then-create is safe here.
#
# + connector - the system to write to
# + resourceValue - the typed FHIR resource, which must carry the identifier
# + system - identifier system
# + value - identifier value
# + return - the id of the created or existing resource
isolated function createOnce(fhir:FHIRConnector connector, anydata resourceValue, string system, string value)
        returns string|error {
    json resourceJson = check fhirJson(resourceValue);
    string resourceType = (check resourceJson.resourceType).toString();
    json[] matches = check searchResources(connector, resourceType, {"identifier": [string `${system}|${value}`]});
    if matches.length() > 0 {
        return (check matches[0].id).toString();
    }
    fhir:FHIRResponse response = check connector->create(resourceJson, returnPreference = fhir:REPRESENTATION);
    return createdId(response);
}
