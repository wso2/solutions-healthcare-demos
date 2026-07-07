isolated map<PendingCase> pendingCases = {};

isolated function putPendingCase(string patientId, PendingCase pendingCase) {
    lock {
        pendingCases[patientId] = pendingCase.clone();
    }
}

isolated function getPendingCase(string patientId) returns PendingCase? {
    lock {
        if pendingCases.hasKey(patientId) {
            return pendingCases.get(patientId).clone();
        }
        return ();
    }
}

# Marks a case resolved so a still-pending timeout watcher no-ops instead of double-escalating,
# and removes it so a second /emergency-answers call for the same patient can't replay it.
isolated function resolvePendingCase(string patientId) {
    lock {
        _ = pendingCases.removeIfHasKey(patientId);
    }
}
