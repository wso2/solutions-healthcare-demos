import ballerinax/health.clients.fhir;

// Small helpers for reading the lab's FHIR resources as json.

# Reads one resource from the lab's FHIR server.
#
# + resourceType - the FHIR resource type, e.g. `Patient`
# + id - the resource id
# + return - the resource, or an error if it cannot be read
isolated function readResource(string resourceType, string id) returns json|error {
    fhir:FHIRResponse response = check labFhir->getById(resourceType, id);
    return <json>response.'resource;
}

# Picks the resources of one type out of a search bundle.
#
# + bundle - a searchset Bundle
# + resourceType - the type to keep
# + return - the matching resources, in bundle order
isolated function resourcesOfType(json bundle, string resourceType) returns json[] {
    json[] matches = [];
    json|error entries = bundle.entry;
    if entries is json[] {
        foreach json entry in entries {
            json|error value = entry.'resource;
            if value is map<json> && value["resourceType"] == resourceType {
                matches.push(value);
            }
        }
    }
    return matches;
}

# The tests on an order, read from the lab test codings in `orderDetail`.
#
# + serviceRequest - the ServiceRequest
# + return - the ordered tests; empty if none use the lab's test code system
isolated function orderedTests(json serviceRequest) returns OrderedTest[] {
    OrderedTest[] tests = [];
    json|error details = serviceRequest.orderDetail;
    if details !is json[] {
        return tests;
    }
    foreach json detail in details {
        json|error codings = detail.coding;
        if codings !is json[] {
            continue;
        }
        foreach json coding in codings {
            if coding is map<json> && coding["system"] == LAB_TEST_CODE_SYSTEM {
                tests.push({code: coding["code"].toString(), name: (coding["display"] ?: coding["code"]).toString()});
            }
        }
    }
    return tests;
}

# The value of a resource's identifier in a given system.
#
# + value - the resource
# + system - the identifier system
# + return - the identifier value, or nil if the resource has none in that system
isolated function identifierValue(json value, string system) returns string? {
    json|error identifiers = value.identifier;
    if identifiers is json[] {
        foreach json identifier in identifiers {
            if identifier is map<json> && identifier["system"] == system {
                return identifier["value"].toString();
            }
        }
    }
    return ();
}

# The patient's medical record number. Lab patients are registered by the integration with one
# identifier — the MRN from their own EHR, in that EHR's identifier system.
#
# + patient - the Patient resource
# + return - the MRN, or nil if the patient has none
isolated function mrnOf(json patient) returns string? {
    json|error identifiers = patient.identifier;
    if identifiers is json[] && identifiers.length() > 0 {
        json|error value = identifiers[0].value;
        return value is string ? value : ();
    }
    return ();
}

# The patient's display name: the first name's text, else its family name.
#
# + patient - the Patient resource
# + return - the name, or `Unknown` if the patient has none
isolated function humanName(json patient) returns string {
    json|error names = patient.name;
    if names is json[] && names.length() > 0 {
        json|error text = names[0].text;
        if text is string {
            return text;
        }
        json|error family = names[0].family;
        return family is string ? family : "Unknown";
    }
    return "Unknown";
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
isolated function basedOnContains(json report, string serviceRequestId) returns boolean {
    json|error basedOn = report.basedOn;
    if basedOn is json[] {
        foreach json ref in basedOn {
            json|error reference = ref.reference;
            if reference is string && reference.endsWith("ServiceRequest/" + serviceRequestId) {
                return true;
            }
        }
    }
    return false;
}

# The first reference in a list field, such as `specimen` on a ServiceRequest.
#
# + resourceJson - the resource
# + field - the list field
# + return - the reference, or nil when the field is missing or empty
isolated function referenceAt(json resourceJson, string 'field) returns string? {
    if resourceJson !is map<json> {
        return ();
    }
    json items = resourceJson['field];
    if items !is json[] || items.length() == 0 {
        return ();
    }
    json|error reference = items[0].reference;
    return reference is string ? reference : ();
}

# The id assigned to one entry of a transaction, read from its `location`.
#
# + transactionResponse - the transaction-response Bundle
# + index - position of the entry in the request bundle (responses keep request order)
# + resourceType - the entry's resource type
# + return - the id, or an error if the response has no usable location at that position
isolated function idAtEntry(json transactionResponse, int index, string resourceType) returns string|error {
    json|error entries = transactionResponse.entry;
    if entries !is json[] || entries.length() <= index {
        return error(string `Transaction response is missing entry ${index}`);
    }
    json|error location = entries[index].response.location;
    if location !is string {
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
