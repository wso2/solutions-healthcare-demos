// Each bundle only ever carries one patient's readings, so the first entry's subject reference is enough.
isolated function extractPatientIdFromVitalsBundle(json bundle) returns string|error {
    json[] entries = check trap <json[]>(checkpanic bundle.entry);
    if entries.length() == 0 {
        return error("vitals bundle has no entries");
    }
    string reference = check trap <string>(checkpanic entries[0].'resource.subject.reference);
    if !reference.startsWith("Patient/") {
        return error("unexpected subject reference: " + reference);
    }
    return reference.substring("Patient/".length());
}
