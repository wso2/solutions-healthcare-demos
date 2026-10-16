import ballerina/lang.'int as langint;
import ballerina/log;
import ballerina/random;
import ballerina/time;
import ballerina/url;
import ballerina/uuid;
import ballerinax/health.fhir.r4 as r4;

// ── Correlation / id helpers ──

# Returns the incoming X-Request-Id header value, or generates a new UUID if absent.
# + incomingRequestId - the X-Request-Id header value from the inbound request, if present
# + return - the correlation id to use for this request
isolated function resolveRequestId(string? incomingRequestId) returns string {
    if incomingRequestId is string && incomingRequestId.trim().length() > 0 {
        return incomingRequestId;
    }
    return uuid:createRandomUuid();
}

# Generates a workflow (Task) id in the form `lw-<6 hex chars>`.
# + return - a new workflow id, or an error if random generation fails
isolated function generateWorkflowId() returns string|error {
    int randomValue = check random:createIntInRange(0, 16777215);
    string hex = langint:toHexString(randomValue);
    while hex.length() < 6 {
        hex = "0" + hex;
    }
    return string `lw-${hex}`;
}

// ── FHIR OperationOutcome error model ──

# FHIR issue-type codes used by this API's error model.
public enum IssueCode {
    ISSUE_INVALID = "invalid",
    ISSUE_SECURITY = "security",
    ISSUE_NOT_FOUND = "not-found",
    ISSUE_BUSINESS_RULE = "business-rule",
    ISSUE_EXPIRED = "expired",
    ISSUE_CONFLICT = "conflict",
    ISSUE_PROCESSING = "processing",
    ISSUE_TRANSIENT = "transient"
}

const string UPSTREAM_SYSTEM_URI = "urn:wso2:longevity:upstream";

# Builds a FHIR OperationOutcome for an error response.
# + severity - issue severity (error | fatal | warning | information)
# + issueCode - the FHIR issue-type code
# + diagnostics - human readable diagnostics text
# + expression - optional FHIRPath expression(s) pointing at the offending element
# + upstreamSystem - when set (`cerner` or `quest`), added as details.coding for upstream failures
# + return - the OperationOutcome resource
isolated function buildOperationOutcome(r4:OperationOutcomeIssueSeverity severity, string issueCode, string diagnostics,
        string[]? expression = (), string? upstreamSystem = ()) returns r4:OperationOutcome {
    r4:OperationOutcomeIssue issue = {
        severity: severity,
        code: issueCode,
        diagnostics: diagnostics
    };
    if expression is string[] {
        issue.expression = expression;
    }
    if upstreamSystem is string {
        issue.details = {
            coding: [{system: UPSTREAM_SYSTEM_URI, code: upstreamSystem}]
        };
    }
    return {
        resourceType: "OperationOutcome",
        issue: [issue]
    };
}

# Builds a 400 Bad Request response body (OperationOutcome, issue code `invalid`).
isolated function badRequestOutcome(string diagnostics, string[]? expression = ()) returns r4:OperationOutcome =>
    buildOperationOutcome("error", ISSUE_INVALID, diagnostics, expression);

# Builds a 401 Unauthorized response body (OperationOutcome, issue code `security`).
isolated function unauthorizedOutcome(string diagnostics) returns r4:OperationOutcome =>
    buildOperationOutcome("error", ISSUE_SECURITY, diagnostics);

# Builds a 404 Not Found response body (OperationOutcome, issue code `not-found`).
isolated function notFoundOutcome(string diagnostics) returns r4:OperationOutcome =>
    buildOperationOutcome("error", ISSUE_NOT_FOUND, diagnostics);

# Builds a 409 Conflict / invalid-state response body (OperationOutcome, issue code `business-rule`).
# + currentStage - the workflow's current stage
# + requiredStage - the stage required for the attempted operation
isolated function businessRuleOutcome(string workflowId, string currentStage, string requiredStage) returns r4:OperationOutcome =>
    buildOperationOutcome("error", ISSUE_BUSINESS_RULE,
            string `Task ${workflowId} is in '${currentStage}'; this operation requires '${requiredStage}'`);

# Builds a 410 Gone response body (OperationOutcome, issue code `expired`).
isolated function expiredOutcome(string diagnostics) returns r4:OperationOutcome =>
    buildOperationOutcome("error", ISSUE_EXPIRED, diagnostics);

# Builds a 412 Precondition Failed response body (OperationOutcome, issue code `conflict`).
isolated function etagConflictOutcome(string diagnostics) returns r4:OperationOutcome =>
    buildOperationOutcome("error", ISSUE_CONFLICT, diagnostics);

# Builds a 422 Unprocessable Entity response body (OperationOutcome, issue code `processing`).
isolated function processingOutcome(string diagnostics, string[]? expression = ()) returns r4:OperationOutcome =>
    buildOperationOutcome("error", ISSUE_PROCESSING, diagnostics, expression);

# Builds a 502 Bad Gateway response body (OperationOutcome, issue code `transient`) naming the failed upstream.
# + upstreamSystem - `cerner` or `quest`
isolated function upstreamErrorOutcome(string diagnostics, string upstreamSystem) returns r4:OperationOutcome =>
    buildOperationOutcome("error", ISSUE_TRANSIENT, diagnostics, upstreamSystem = upstreamSystem);

// ── Logging helpers ──

# Logs an inbound API request with its correlation id and, when known, the workflow id.
isolated function logRequest(string requestId, string operation, string? workflowId = ()) {
    if workflowId is string {
        log:printInfo("Inbound request", requestId = requestId, operation = operation, workflowId = workflowId);
    } else {
        log:printInfo("Inbound request", requestId = requestId, operation = operation);
    }
}

# Logs an outbound upstream call with its correlation id and, when known, the workflow id.
isolated function logUpstreamCall(string requestId, string upstreamSystem, string operation, string? workflowId = ()) {
    if workflowId is string {
        log:printInfo("Upstream call", requestId = requestId, system = upstreamSystem, operation = operation, workflowId = workflowId);
    } else {
        log:printInfo("Upstream call", requestId = requestId, system = upstreamSystem, operation = operation);
    }
}

# Logs an upstream call failure.
isolated function logUpstreamError(string requestId, string upstreamSystem, string operation, error cause) {
    log:printError("Upstream call failed", 'error = cause, requestId = requestId, system = upstreamSystem, operation = operation);
}

// ── Base URL rewriting ──

# Rewrites a Cerner `fullUrl` / reference URL so it points at this API's base URL instead of Cerner's.
# Only the scheme+host+port+Cerner-base-path prefix is replaced; the resource path/id is preserved.
# + cernerUrl - a URL or reference string produced by Cerner
# + return - the equivalent URL under this API's base URL
isolated function rewriteToApiBaseUrl(string cernerUrl) returns string {
    if cernerUrl.startsWith(cernerBaseUrl) {
        string suffix = cernerUrl.substring(cernerBaseUrl.length());
        return apiBaseUrl + suffix;
    }
    return cernerUrl;
}

# Rewrites the `fullUrl` of every entry in a Bundle (in place on a cloned copy) to use this API's base URL.
# + bundle - a Bundle received from Cerner
# + return - a new Bundle with rewritten fullUrl/link values
isolated function rewriteBundleUrls(r4:Bundle bundle) returns r4:Bundle {
    r4:Bundle rewritten = bundle.clone();
    r4:BundleEntry[]? entries = rewritten.entry;
    if entries is r4:BundleEntry[] {
        foreach r4:BundleEntry entry in entries {
            string? fullUrl = entry.fullUrl;
            if fullUrl is string {
                entry.fullUrl = rewriteToApiBaseUrl(fullUrl);
            }
        }
    }
    r4:BundleLink[]? links = rewritten.link;
    if links is r4:BundleLink[] {
        foreach r4:BundleLink link in links {
            string? url = link.url;
            if url is string {
                link.url = rewriteToApiBaseUrl(url);
            }
        }
    }
    return rewritten;
}

// ── ISO-8601 duration helpers (subset: P<n>Y / P<n>M / P<n>D and PT<n>H / PT<n>M / PT<n>S) ──

# Parses a simple ISO-8601 duration string (e.g. `P3Y`, `PT72H`, `PT15M`) into seconds.
# Supports a single designator combination as used by this API's configuration
# (years, months, days in the date part; hours, minutes, seconds in the time part).
# + isoDuration - the ISO-8601 duration string
# + return - the duration in seconds, or an error if the string could not be parsed
isolated function parseIsoDurationToSeconds(string isoDuration) returns decimal|error {
    if !isoDuration.startsWith("P") {
        return error(string `Invalid ISO-8601 duration: ${isoDuration}`);
    }
    string remainder = isoDuration.substring(1);
    boolean inTimePart = false;
    decimal totalSeconds = 0;
    string numberBuffer = "";

    foreach string:Char ch in remainder {
        if ch == "T" {
            inTimePart = true;
            continue;
        }
        if ch >= "0" && ch <= "9" || ch == "." {
            numberBuffer += ch;
            continue;
        }
        decimal value = check decimal:fromString(numberBuffer);
        numberBuffer = "";
        if !inTimePart {
            if ch == "Y" {
                totalSeconds += value * 365 * 24 * 3600;
            } else if ch == "M" {
                totalSeconds += value * 30 * 24 * 3600;
            } else if ch == "D" {
                totalSeconds += value * 24 * 3600;
            } else {
                return error(string `Unsupported ISO-8601 date designator: ${ch}`);
            }
        } else {
            if ch == "H" {
                totalSeconds += value * 3600;
            } else if ch == "M" {
                totalSeconds += value * 60;
            } else if ch == "S" {
                totalSeconds += value;
            } else {
                return error(string `Unsupported ISO-8601 time designator: ${ch}`);
            }
        }
    }
    return totalSeconds;
}

# Returns the current UTC time plus the given ISO-8601 duration, as an RFC3339 string.
# + isoDuration - the ISO-8601 duration to add
# + return - the resulting RFC3339 timestamp, or an error if the duration could not be parsed
isolated function utcNowPlusIsoDuration(string isoDuration) returns string|error {
    decimal seconds = check parseIsoDurationToSeconds(isoDuration);
    time:Utc result = time:utcAddSeconds(time:utcNow(), seconds);
    return time:utcToString(result);
}

# Returns an RFC3339 timestamp for "now minus the given ISO-8601 duration" - used for lookback windows.
# + isoDuration - the ISO-8601 duration to subtract
# + return - the resulting RFC3339 timestamp, or an error if the duration could not be parsed
isolated function utcNowMinusIsoDuration(string isoDuration) returns string|error {
    decimal seconds = check parseIsoDurationToSeconds(isoDuration);
    time:Utc result = time:utcAddSeconds(time:utcNow(), -seconds);
    return time:utcToString(result);
}

// ── Query string helpers ──

# Builds a URL-encoded query string (including the leading `?`) from a map of search parameters.
# Returns an empty string when the map is empty.
# + searchParams - the search parameters to encode
# + return - the encoded query string, or an error if encoding failed
isolated function buildQueryString(map<string> searchParams) returns string|error {
    if searchParams.length() == 0 {
        return "";
    }
    string[] pairs = [];
    foreach [string, string] [key, value] in searchParams.entries() {
        string encodedKey = check url:encode(key, "UTF-8");
        string encodedValue = check url:encode(value, "UTF-8");
        pairs.push(string `${encodedKey}=${encodedValue}`);
    }
    return string `?${string:'join("&", ...pairs)}`;
}

// ── Bundle helpers ──

# Extracts every `entry.resource` of the given resourceType from a searchset/collection Bundle.
# + bundle - the source Bundle
# + resourceType - the FHIR resourceType to filter for (e.g. "Encounter")
# + return - the matching resources as `json[]` (ready for `cloneWithType` into a typed array)
isolated function extractResourcesFromBundle(r4:Bundle bundle, string resourceType) returns json[] {
    json[] matches = [];
    r4:BundleEntry[]? entries = bundle.entry;
    if entries is r4:BundleEntry[] {
        foreach r4:BundleEntry entry in entries {
            anydata? resourceValue = entry?.'resource;
            if resourceValue is map<anydata> && resourceValue["resourceType"] == resourceType {
                json|error asJson = resourceValue.cloneWithType();
                if asJson is json {
                    matches.push(asJson);
                }
            }
        }
    }
    return matches;
}
