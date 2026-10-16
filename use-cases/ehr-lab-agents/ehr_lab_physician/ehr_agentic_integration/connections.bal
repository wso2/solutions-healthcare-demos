import ballerina/http;
import ballerina/time;
import ballerina/url;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// Cerner FHIR client. Authentication is handled manually (see getCernerAccessToken)
// instead of http:OAuth2ClientCredentialsGrantConfig so that we control caching and
// the 30s-before-expiry refresh explicitly, as required by the spec.
final http:Client cernerClient = check new (cernerBaseUrl, {
    timeout: cernerTimeoutSeconds,
    retryConfig: {
        count: cernerRetries,
        interval: 1,
        backOffFactor: 2.0,
        maxWaitInterval: 10
    }
});

// Separate client for the Cerner OAuth2 token endpoint (different base path).
final http:Client cernerTokenClient = check new (cernerTokenUrl, {
    timeout: cernerTimeoutSeconds
});

// Cached Cerner access token, refreshed 30s before expiry.
type CernerTokenCache record {
    string accessToken;
    time:Utc expiryTime;
};

isolated CernerTokenCache? cernerTokenCache = ();

// Refresh buffer: refresh the token when fewer than this many seconds remain.
const decimal TOKEN_REFRESH_BUFFER_SECONDS = 30;

type CernerTokenResponse record {
    string access_token;
    int expires_in;
};

# Returns a valid Cerner access token, fetching/refreshing it if required.
# Caches the token and refreshes it 30 seconds before it expires.
# + return - a valid access token, or an error if the token endpoint call fails
isolated function getCernerAccessToken() returns string|error {
    lock {
        if cernerTokenCache is CernerTokenCache {
            CernerTokenCache cached = <CernerTokenCache>cernerTokenCache;
            time:Utc now = time:utcNow();
            decimal secondsRemaining = time:utcDiffSeconds(cached.expiryTime, now);
            if secondsRemaining > TOKEN_REFRESH_BUFFER_SECONDS {
                return cached.accessToken;
            }
        }
    }

    // Fetch a new token outside the lock since this is a network call.
    string formBody = string `grant_type=client_credentials&client_id=${
        check url:encode(cernerClientId, "UTF-8")}&client_secret=${
        check url:encode(cernerClientSecret, "UTF-8")}&scope=${
        check url:encode(cernerScopes, "UTF-8")}`;

    CernerTokenResponse tokenResponse = check cernerTokenClient->post(
        "",
        formBody,
        mediaType = "application/x-www-form-urlencoded",
        targetType = CernerTokenResponse
    );

    time:Utc newExpiry = time:utcAddSeconds(time:utcNow(), <decimal>tokenResponse.expires_in);
    lock {
        cernerTokenCache = {accessToken: tokenResponse.access_token, expiryTime: newExpiry};
    }
    return tokenResponse.access_token;
}

# Builds the Authorization header map for a Cerner call using a fresh/cached access token.
# + return - headers map with the Bearer token, or an error if a token could not be obtained
isolated function cernerAuthHeaders() returns map<string>|error {
    string token = check getCernerAccessToken();
    return {"Authorization": string `Bearer ${token}`};
}

// ── Cerner Patient operations ──

# Searches patients in Cerner using the given search parameters.
# + searchParams - FHIR search parameters (e.g. family, given, birthdate, gender, identifier, _count)
# + requestId - correlation id for logging
# + return - the raw Cerner search Bundle, or an error if the call failed
isolated function cernerSearchPatient(map<string> searchParams, string requestId) returns r4:Bundle|error {
    map<string> headers = check cernerAuthHeaders();
    logUpstreamCall(requestId, "cerner", "searchPatient");
    string queryString = check buildQueryString(searchParams);
    r4:Bundle result = check cernerClient->get(string `/Patient${queryString}`, headers, r4:Bundle);
    return result;
}

# Reads a single patient from Cerner by id.
# + patientId - the Cerner patient id
# + requestId - correlation id for logging
# + return - the Patient resource, or an error if the call failed (e.g. 404)
isolated function cernerReadPatient(string patientId, string requestId) returns international401:Patient|error {
    map<string> headers = check cernerAuthHeaders();
    logUpstreamCall(requestId, "cerner", "readPatient");
    international401:Patient result = check cernerClient->/Patient/[patientId].get(headers = headers,
            targetType = international401:Patient);
    return result;
}

# Searches encounters in Cerner for a patient, limited by a lookback start date.
isolated function cernerSearchEncounters(string patientId, string sinceDate, string requestId)
        returns international401:Encounter[]|error {
    map<string> headers = check cernerAuthHeaders();
    logUpstreamCall(requestId, "cerner", "searchEncounters");
    r4:Bundle result = check cernerClient->/Encounter.get(headers = headers, targetType = r4:Bundle,
            'patient = string `Patient/${patientId}`, 'date = string `ge${sinceDate}`);
    return extractResourcesFromBundle(result, "Encounter").cloneWithType();
}

# Searches conditions in Cerner for a patient.
isolated function cernerSearchConditions(string patientId, string requestId) returns international401:Condition[]|error {
    map<string> headers = check cernerAuthHeaders();
    logUpstreamCall(requestId, "cerner", "searchConditions");
    r4:Bundle result = check cernerClient->/Condition.get(headers = headers, targetType = r4:Bundle,
            'patient = string `Patient/${patientId}`);
    return extractResourcesFromBundle(result, "Condition").cloneWithType();
}

# Searches laboratory Observations in Cerner for a patient, limited by a lookback start date.
isolated function cernerSearchLabObservations(string patientId, string sinceDate, string requestId)
        returns international401:Observation[]|error {
    map<string> headers = check cernerAuthHeaders();
    logUpstreamCall(requestId, "cerner", "searchObservations");
    r4:Bundle result = check cernerClient->/Observation.get(headers = headers, targetType = r4:Bundle,
            'patient = string `Patient/${patientId}`, category = "laboratory", 'date = string `ge${sinceDate}`);
    return extractResourcesFromBundle(result, "Observation").cloneWithType();
}

# Searches DiagnosticReports in Cerner for a patient, limited by a lookback start date.
isolated function cernerSearchDiagnosticReports(string patientId, string sinceDate, string requestId)
        returns international401:DiagnosticReport[]|error {
    map<string> headers = check cernerAuthHeaders();
    logUpstreamCall(requestId, "cerner", "searchDiagnosticReports");
    r4:Bundle result = check cernerClient->/DiagnosticReport.get(headers = headers, targetType = r4:Bundle,
            'patient = string `Patient/${patientId}`, 'date = string `ge${sinceDate}`);
    return extractResourcesFromBundle(result, "DiagnosticReport").cloneWithType();
}
