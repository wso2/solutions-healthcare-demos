import ballerina/http;
import ballerina/time;

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

isolated function nowSecs() returns decimal {
    time:Utc u = time:utcNow();
    return <decimal>u[0] + u[1];
}

isolated function secsToStr(decimal s) returns string {
    int whole = <int>s;
    return time:utcToString([whole, s - <decimal>whole]);
}

isolated function lastSegment(string ref) returns string {
    int? i = ref.lastIndexOf("/");
    return i is int ? ref.substring(i + 1) : ref;
}

isolated function fhirResponse(int status, json body) returns http:Response {
    http:Response res = new;
    res.statusCode = status;
    res.setJsonPayload(body, FHIR_JSON);
    return res;
}

isolated function outcome(int status, string code, string diagnostics) returns http:Response {
    return fhirResponse(status, outcomeJson(code, diagnostics));
}

isolated function outcomeJson(string code, string diagnostics) returns json {
    return {
        resourceType: "OperationOutcome",
        issue: [{severity: "error", code, diagnostics, details: {text: diagnostics}}]
    };
}

// Inbound API key check; returns an error response or ().
isolated function checkApiKey(http:Request req) returns http:Response? {
    string|http:HeaderNotFoundError k = req.getHeader("X-API-Key");
    if k is string && k == inboundApiKey {
        return ();
    }
    return outcome(401, "security", "Missing or invalid X-API-Key");
}

isolated function parseBody(http:Request req) returns json|string {
    string|error text = req.getTextPayload();
    if text is error {
        return "Request body is required";
    }
    json|error j = text.fromJsonString();
    if j is error {
        return "Request body must be valid JSON";
    }
    return j;
}

// Reference string without a leading base URL / type, e.g. "Encounter/123" -> "Encounter/123".
isolated function normRef(string ref) returns string {
    if ref.startsWith("http") {
        int? i = ref.lastIndexOf("/");
        if i is int {
            string head = ref.substring(0, i);
            int? j = head.lastIndexOf("/");
            if j is int {
                return ref.substring(j + 1);
            }
        }
    }
    return ref;
}
