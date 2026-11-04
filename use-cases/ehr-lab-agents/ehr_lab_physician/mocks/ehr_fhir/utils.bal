import ballerina/http;
import ballerina/lang.runtime;
import ballerina/random;
import ballerina/time;

// ── JSON helpers ──
isolated function jpath(json j, string... path) returns json {
    json cur = j;
    foreach string p in path {
        if cur is map<json> {
            cur = cur[p];
        } else {
            return ();
        }
    }
    return cur;
}

isolated function arr(json j) returns json[] {
    return j is json[] ? j : [];
}

isolated function strOf(json j) returns string {
    return j is string ? j : "";
}

isolated function nowStr() returns string {
    return time:utcToString(time:utcNow());
}

isolated function lastSegment(string ref) returns string {
    int? i = ref.lastIndexOf("/");
    return i is int ? ref.substring(i + 1) : ref;
}

// ── Responses ──
isolated function fhirResponse(int status, json body) returns http:Response {
    http:Response res = new;
    res.statusCode = status;
    res.setJsonPayload(body, FHIR_JSON);
    return res;
}

isolated function outcome(int status, string code, string diagnostics) returns http:Response {
    string severity = status >= 500 ? "fatal" : "error";
    return fhirResponse(status, {
        resourceType: "OperationOutcome",
        issue: [{severity, code, diagnostics, details: {text: diagnostics}}]
    });
}

// Latency, random failure and bearer-token check applied to every FHIR call.
function guard(http:Request req) returns http:Response? {
    if latencyMs > 0 {
        runtime:sleep(<decimal>latencyMs / 1000.0d);
    }
    if failureRate > 0.0d {
        decimal r = <decimal>random:createDecimal();
        if r < failureRate {
            http:Response res = outcome(503, "transient", "Simulated transient failure");
            res.setHeader("Retry-After", "1");
            return res;
        }
    }
    if requireAuth {
        string|http:HeaderNotFoundError h = req.getHeader("Authorization");
        if h is string && h.startsWith("Bearer ") && isValidToken(h.substring(7).trim()) {
            return ();
        }
        return outcome(401, "security", "Missing or invalid bearer token");
    }
    return ();
}
