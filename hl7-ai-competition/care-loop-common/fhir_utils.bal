import ballerinax/health.clients.fhir;

# Capability-statement validation would GET /metadata at construction time, racing the caller's own startup against the FHIR server's - disabled for every connector built this way.
public isolated function newFhirConnector(string baseUrl) returns fhir:FHIRConnector|error =>
    new ({baseURL: baseUrl}, enableCapabilityStatementValidation = false);

# create()'s default MINIMAL preference returns {resourceId, version}, not a full resource - fall back to "id" in case that changes.
public isolated function extractFhirId(fhir:FHIRResponse response) returns string? {
    json|xml resourceValue = response.'resource;
    if resourceValue is xml {
        return ();
    }
    string|error resourceId = trap <string>(checkpanic resourceValue.resourceId);
    if resourceId is string {
        return resourceId;
    }
    string|error id = trap <string>(checkpanic resourceValue.id);
    return id is string ? id : ();
}
