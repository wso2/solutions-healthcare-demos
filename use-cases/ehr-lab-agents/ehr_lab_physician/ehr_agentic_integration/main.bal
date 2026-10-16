import ballerina/http;
import ballerina/log;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

# Starts the background lab-result polling job before any request is served.
public function main() returns error? {
    check startLabResultPollingJob(labResultPollingIntervalSeconds);
}

# Longevity Care Workflow API - FHIR R4 facade over Cerner (EHR) and Quest (Diagnostics).
# Phase 1: Patient search / read / $summary (rule-based narratives).
service /longevity/fhir/r4 on new http:Listener(listenerPort) {

    # Search patients (Step 1 - Enter patient info). Proxied to Cerner `Patient` search.
    # At least one search parameter is required.
    #
    # + family - patient family name
    # + given - patient given name
    # + birthdate - patient date of birth
    # + gender - patient gender
    # + identifier - `system|value`, e.g. MRN
    # + count - maximum number of results (`_count`)
    # + xRequestId - correlation id; generated if absent
    # + return - a FHIR searchset Bundle, or an OperationOutcome error
    resource function get Patient(string? family = (), string? given = (), string? birthdate = (),
            string? gender = (), string? identifier = (), @http:Header {name: "X-Request-Id"} string? xRequestId = (),
            @http:Query {name: "_count"} int? count = ()) returns http:Ok|http:BadRequest|http:Unauthorized|http:BadGateway {
        string requestId = resolveRequestId(xRequestId);
        logRequest(requestId, "searchPatient");

        map<string> searchParams = {};
        if family is string {
            searchParams["family"] = family;
        }
        if given is string {
            searchParams["given"] = given;
        }
        if birthdate is string {
            searchParams["birthdate"] = birthdate;
        }
        if gender is string {
            searchParams["gender"] = gender;
        }
        if identifier is string {
            searchParams["identifier"] = identifier;
        }
        if count is int {
            searchParams["_count"] = count.toString();
        }

        if searchParams.length() == 0 {
            r4:OperationOutcome outcome = badRequestOutcome("At least one search parameter is required for Patient search.");
            return <http:BadRequest>{
                mediaType: "application/fhir+json",
                headers: {"X-Request-Id": requestId},
                body: outcome
            };
        }

        r4:Bundle|error cernerResult = cernerSearchPatient(searchParams, requestId);
        if cernerResult is error {
            logUpstreamError(requestId, "cerner", "searchPatient", cernerResult);
            r4:OperationOutcome outcome = upstreamErrorOutcome(
                    string `Cerner FHIR endpoint failed: ${cernerResult.message()}`, "cerner");
            return <http:BadGateway>{
                mediaType: "application/fhir+json",
                headers: {"X-Request-Id": requestId},
                body: outcome
            };
        }

        r4:Bundle rewritten = rewriteBundleUrls(cernerResult);
        return <http:Ok>{
            mediaType: "application/fhir+json",
            headers: {"X-Request-Id": requestId},
            body: rewritten
        };
    }

    # Read a patient by id.
    #
    # + id - the patient id
    # + xRequestId - correlation id; generated if absent
    # + return - the Patient resource, or an OperationOutcome error
    resource function get Patient/[string id](@http:Header {name: "X-Request-Id"} string? xRequestId = ())
            returns http:Ok|http:NotFound|http:BadGateway {
        string requestId = resolveRequestId(xRequestId);
        logRequest(requestId, "readPatient");

        international401:Patient|error cernerResult = cernerReadPatient(id, requestId);
        if cernerResult is error {
            logUpstreamError(requestId, "cerner", "readPatient", cernerResult);
            r4:OperationOutcome outcome = notFoundOutcome(string `Patient/${id} was not found.`);
            return <http:NotFound>{
                mediaType: "application/fhir+json",
                headers: {"X-Request-Id": requestId},
                body: outcome
            };
        }

        return <http:Ok>{
            mediaType: "application/fhir+json",
            headers: {"X-Request-Id": requestId},
            body: cernerResult
        };
    }

    # Patient summary (Step 2 - View patient summary). Aggregates the patient record from
    # Cerner (in parallel) into a FHIR `document` Bundle with an AI-generated narrative.
    #
    # + id - the patient id
    # + lookback - how far back to pull history (ISO-8601 duration), default `P3Y`
    # + aiNarrative - include AI-generated section narratives, default true
    # + xRequestId - correlation id; generated if absent
    # + return - the summary document Bundle, or an OperationOutcome error
    resource function get Patient/[string id]/'\$summary(string lookback = "P3Y", boolean aiNarrative = true,
            @http:Header {name: "X-Request-Id"} string? xRequestId = ())
            returns http:Ok|http:NotFound|http:BadGateway {
        string requestId = resolveRequestId(xRequestId);
        logRequest(requestId, "patientSummary");

        international401:Patient|error patientResult = cernerReadPatient(id, requestId);
        if patientResult is error {
            logUpstreamError(requestId, "cerner", "readPatient", patientResult);
            r4:OperationOutcome outcome = notFoundOutcome(string `Patient/${id} was not found.`);
            return <http:NotFound>{
                mediaType: "application/fhir+json",
                headers: {"X-Request-Id": requestId},
                body: outcome
            };
        }

        string|error sinceDate = utcNowMinusIsoDuration(lookback);
        if sinceDate is error {
            r4:OperationOutcome outcome = badRequestOutcome(string `Invalid lookback duration: ${lookback}`);
            return <http:NotFound>{
                mediaType: "application/fhir+json",
                headers: {"X-Request-Id": requestId},
                body: outcome
            };
        }

        // Fan out to Cerner in parallel: Encounters, Conditions, laboratory Observations, DiagnosticReports.
        future<international401:Encounter[]|error> encountersFuture = start cernerSearchEncounters(id, sinceDate, requestId);
        future<international401:Condition[]|error> conditionsFuture = start cernerSearchConditions(id, requestId);
        future<international401:Observation[]|error> observationsFuture = start cernerSearchLabObservations(id, sinceDate, requestId);
        future<international401:DiagnosticReport[]|error> reportsFuture = start cernerSearchDiagnosticReports(id, sinceDate, requestId);

        record {|
            international401:Encounter[]|error encountersResult;
            international401:Condition[]|error conditionsResult;
            international401:Observation[]|error observationsResult;
            international401:DiagnosticReport[]|error reportsResult;
        |} fanOutResults = wait {
            encountersResult: encountersFuture,
            conditionsResult: conditionsFuture,
            observationsResult: observationsFuture,
            reportsResult: reportsFuture
        };

        r4:OperationOutcomeIssue[] warnings = [];
        international401:Encounter[] encounters = [];
        international401:Encounter[]|error encountersResult = fanOutResults.encountersResult;
        if encountersResult is error {
            logUpstreamError(requestId, "cerner", "searchEncounters", encountersResult);
            warnings.push({severity: "warning", code: ISSUE_TRANSIENT,
                diagnostics: string `Failed to fetch encounters: ${encountersResult.message()}`});
        } else {
            encounters = encountersResult;
        }

        international401:Condition[] conditions = [];
        international401:Condition[]|error conditionsResult = fanOutResults.conditionsResult;
        if conditionsResult is error {
            logUpstreamError(requestId, "cerner", "searchConditions", conditionsResult);
            warnings.push({severity: "warning", code: ISSUE_TRANSIENT,
                diagnostics: string `Failed to fetch conditions: ${conditionsResult.message()}`});
        } else {
            conditions = conditionsResult;
        }

        international401:Observation[] biomarkers = [];
        international401:Observation[]|error observationsResult = fanOutResults.observationsResult;
        if observationsResult is error {
            logUpstreamError(requestId, "cerner", "searchObservations", observationsResult);
            warnings.push({severity: "warning", code: ISSUE_TRANSIENT,
                diagnostics: string `Failed to fetch observations: ${observationsResult.message()}`});
        } else {
            biomarkers = observationsResult;
        }

        international401:DiagnosticReport[] reports = [];
        international401:DiagnosticReport[]|error reportsResult = fanOutResults.reportsResult;
        if reportsResult is error {
            logUpstreamError(requestId, "cerner", "searchDiagnosticReports", reportsResult);
            warnings.push({severity: "warning", code: ISSUE_TRANSIENT,
                diagnostics: string `Failed to fetch diagnostic reports: ${reportsResult.message()}`});
        } else {
            reports = reportsResult;
        }

        r4:Bundle|error summaryBundle = buildPatientSummaryBundle(patientResult, encounters, conditions, biomarkers,
                reports, aiNarrative);
        if summaryBundle is error {
            log:printError("Failed to build patient summary bundle", 'error = summaryBundle, requestId = requestId);
            r4:OperationOutcome outcome = upstreamErrorOutcome(
                    string `Failed to build patient summary: ${summaryBundle.message()}`, "cerner");
            return <http:BadGateway>{
                mediaType: "application/fhir+json",
                headers: {"X-Request-Id": requestId},
                body: outcome
            };
        }

        if warnings.length() > 0 {
            r4:BundleEntry[] entriesWithWarning = summaryBundle.entry ?: [];
            r4:OperationOutcome warningOutcome = {resourceType: "OperationOutcome", issue: warnings};
            entriesWithWarning.push({'resource: warningOutcome});
            summaryBundle.entry = entriesWithWarning;
        }

        return <http:Ok>{
            mediaType: "application/fhir+json",
            headers: {"X-Request-Id": requestId},
            body: summaryBundle
        };
    }
}
