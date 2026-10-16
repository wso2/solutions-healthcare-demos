import ballerina/http;
import ballerina/workflow;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// Quest Diagnostics FHIR client - used to look up lab reports by their placer-order identifier
// while a workflow session is in the `awaiting-lab-results` stage.
final http:Client questClient = check new (questBaseUrl, {
    timeout: 10
});

const string PLACER_ORDER_SYSTEM = "urn:wso2:longevity:placer-order";

# Looks up the DiagnosticReport that Quest has produced for a given placer-order id.
# + placerOrderId - the `<workflowId>-<nn>` placer-order id stamped on the ServiceRequest sent to Quest
# + requestId - correlation id for logging
# + return - the matching DiagnosticReport if Quest has one, `()` if none exists yet, or an error on an upstream failure
isolated function findQuestDiagnosticReport(string placerOrderId, string requestId)
        returns international401:DiagnosticReport?|error {
    logUpstreamCall(requestId, "quest", "searchDiagnosticReport");
    string searchQuery = string `/DiagnosticReport?based-on:identifier=${PLACER_ORDER_SYSTEM}|${placerOrderId}`;
    map<string> headers = {"X-API-Key": questApiKey};
    r4:Bundle result = check questClient->get(searchQuery, headers, r4:Bundle);
    json[] matches = extractResourcesFromBundle(result, "DiagnosticReport");
    if matches.length() == 0 {
        return ();
    }
    international401:DiagnosticReport report = check matches[0].cloneWithType();
    return report;
}

# Workflow activity: polls Quest once for the DiagnosticReport belonging to a placer-order id and
# reports whether the result is final (ready for physician review).
# + placerOrderId - the placer-order id to look up
# + requestId - correlation id for logging
# + return - the lab-poll outcome, or an error if the Quest call failed
@workflow:Activity
isolated function pollQuestForLabResult(string placerOrderId, string requestId) returns LabPollOutcome|error {
    international401:DiagnosticReport? report = check findQuestDiagnosticReport(placerOrderId, requestId);
    if report is () {
        return {ready: false, reportId: (), status: ()};
    }
    string? status = report.status;
    boolean isFinal = status == "final" || status == "amended" || status == "corrected";
    return {ready: isFinal, reportId: report.id, status: status};
}
