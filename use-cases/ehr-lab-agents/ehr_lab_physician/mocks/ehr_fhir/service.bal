import ballerina/http;
import ballerina/log;
import ballerina/mime;

final readonly & map<string[]> REQUIRED = {
    Encounter: ["status", "subject"],
    Observation: ["status", "code", "subject"],
    Condition: ["code", "subject"],
    DiagnosticReport: ["status", "code", "subject"],
    ServiceRequest: ["status", "intent", "subject"],
    ClinicalImpression: ["status", "subject"],
    CarePlan: ["status", "intent", "subject"],
    Composition: ["status", "type", "subject"]
};

final readonly & string[] WRITABLE = ["Encounter", "Observation", "Condition", "DiagnosticReport", "ServiceRequest",
    "ClinicalImpression", "CarePlan", "Composition"];

isolated function parseBody(http:Request req) returns map<json>|string {
    string|error text = req.getTextPayload();
    if text is error {
        return "Request body is required";
    }
    json|error j = text.fromJsonString();
    if j is map<json> {
        return j;
    }
    return "Request body must be a FHIR JSON resource";
}

// Returns an error message, or () when valid.
isolated function validate(string t, map<json> body) returns string? {
    if strOf(body["resourceType"]) != t {
        return "resourceType must be " + t;
    }
    foreach string f in REQUIRED.get(t) {
        if body[f] is () {
            return "Missing required element: " + f;
        }
    }
    return ();
}

isolated function created(json body, string t, string id, int status, int version) returns http:Response {
    http:Response res = fhirResponse(status, body);
    res.setHeader("Location", publicBaseUrl + "/" + t + "/" + id + "/_history/" + version.toString());
    res.setHeader("ETag", "W/\"" + version.toString() + "\"");
    return res;
}

service / on new http:Listener(port) {

    function init() {
        loadSeed();
        log:printInfo("Mock Cerner FHIR server started", port = port, requireAuth = requireAuth,
                latencyMs = latencyMs, failureRate = failureRate);
    }

    // ── SMART backend services token endpoint ──
    resource function post oauth2/token(http:Request req) returns http:Response {
        map<string>|error form = req.getFormParams();
        if form is error || form["grant_type"] != "client_credentials" {
            return tokenError(400, "unsupported_grant_type");
        }
        string cid = form["client_id"] ?: "";
        string sec = form["client_secret"] ?: "";
        string|http:HeaderNotFoundError auth = req.getHeader("Authorization");
        if cid == "" && auth is string && auth.startsWith("Basic ") {
            // client_id:client_secret supplied via HTTP Basic
            string|error dec = decodeBasic(auth.substring(6).trim());
            if dec is string {
                int? i = dec.indexOf(":");
                if i is int {
                    cid = dec.substring(0, i);
                    sec = dec.substring(i + 1);
                }
            }
        }
        if cid != clientId || sec != clientSecret {
            return tokenError(401, "invalid_client");
        }
        http:Response res = new;
        res.setJsonPayload({
            access_token: issueToken(),
            token_type: "Bearer",
            expires_in: 570,
            scope: form["scope"] ?: "system/*.read system/*.write"
        });
        res.setHeader("Cache-Control", "no-store");
        return res;
    }

    resource function get cerner/fhir/r4/metadata(http:Request req) returns http:Response {
        json[] resources = [];
        foreach string t in SUPPORTED_TYPES {
            json[] interactions = [{code: "read"}];
            if t != "Practitioner" && t != "Organization" {
                interactions.push({code: "search-type"});
            }
            if WRITABLE.indexOf(t) is int {
                interactions.push({code: "create"});
                interactions.push({code: "update"});
            }
            resources.push({'type: t, interaction: interactions});
        }
        json securityCoding = {system: "http://terminology.hl7.org/CodeSystem/restful-security-service", code: "SMART-on-FHIR"};
        return fhirResponse(200, {
            resourceType: "CapabilityStatement",
            status: "active",
            date: nowStr(),
            kind: "instance",
            software: {name: "Mock Cerner Millennium FHIR R4"},
            fhirVersion: "4.0.1",
            format: ["application/fhir+json"],
            rest: [{mode: "server", security: {'service: [{coding: [securityCoding]}]}, 'resource: resources}]
        });
    }

    resource function get cerner/fhir/r4/[string t](http:Request req) returns http:Response {
        http:Response? g = guard(req);
        if g is http:Response {
            return g;
        }
        if !isSupportedType(t) {
            return outcome(404, "not-found", "Unsupported resource type: " + t);
        }
        if t == "Practitioner" || t == "Organization" {
            return outcome(405, "not-supported", "Search is not supported for " + t);
        }
        return search(t, req);
    }

    resource function get cerner/fhir/r4/[string t]/[string id](http:Request req) returns http:Response {
        http:Response? g = guard(req);
        if g is http:Response {
            return g;
        }
        if !isSupportedType(t) {
            return outcome(404, "not-found", "Unsupported resource type: " + t);
        }
        json r = getResource(t, id);
        if r is () {
            return outcome(404, "not-found", t + "/" + id + " not found");
        }
        http:Response res = fhirResponse(200, r);
        res.setHeader("ETag", "W/\"" + strOf(jpath(r, "meta", "versionId")) + "\"");
        return res;
    }

    resource function post cerner/fhir/r4/[string t](http:Request req) returns http:Response {
        http:Response? g = guard(req);
        if g is http:Response {
            return g;
        }
        if WRITABLE.indexOf(t) is () {
            return outcome(405, "not-supported", "create is not supported for " + t);
        }
        map<json>|string body = parseBody(req);
        if body is string {
            return outcome(400, "invalid", body);
        }
        string? err = validate(t, body);
        if err is string {
            return outcome(422, "invalid", err);
        }
        string id = nextId();
        body["id"] = id;
        body["meta"] = {versionId: "1", lastUpdated: nowStr(), 'source: "cerner"};
        putResource(t, id, body);
        recordWrite("create", t, id, 1);
        return created(body, t, id, 201, 1);
    }

    resource function put cerner/fhir/r4/[string t]/[string id](http:Request req) returns http:Response {
        http:Response? g = guard(req);
        if g is http:Response {
            return g;
        }
        if WRITABLE.indexOf(t) is () {
            return outcome(405, "not-supported", "update is not supported for " + t);
        }
        json existing = getResource(t, id);
        if existing is () {
            return outcome(404, "not-found", t + "/" + id + " not found");
        }
        map<json>|string body = parseBody(req);
        if body is string {
            return outcome(400, "invalid", body);
        }
        string? err = validate(t, body);
        if err is string {
            return outcome(422, "invalid", err);
        }
        json bodyId = body["id"];
        if bodyId is string && bodyId != id {
            return outcome(400, "invalid", "Resource id does not match the URL");
        }
        string current = strOf(jpath(existing, "meta", "versionId"));
        string|http:HeaderNotFoundError im = req.getHeader("If-Match");
        if im is string {
            string wanted = im.trim();
            if wanted.startsWith("W/") {
                wanted = wanted.substring(2);
            }
            if wanted.length() >= 2 && wanted.startsWith("\"") && wanted.endsWith("\"") {
                wanted = wanted.substring(1, wanted.length() - 1);
            }
            if wanted != current {
                return outcome(412, "conflict", "If-Match " + im + " does not match current version " + current);
            }
        }
        int|error cv = int:fromString(current);
        int version = (cv is int ? cv : 1) + 1;
        body["id"] = id;
        body["meta"] = {versionId: version.toString(), lastUpdated: nowStr(), 'source: "cerner"};
        putResource(t, id, body);
        recordWrite("update", t, id, version);
        return created(body, t, id, 200, version);
    }

    // ── Admin / test helpers ──
    resource function post admin/reset() returns http:Response {
        resetStore();
        return fhirResponse(200, {resourceType: "OperationOutcome", issue: [{severity: "information", code: "informational", diagnostics: "Seed data restored"}]});
    }

    resource function get admin/writes() returns http:Response {
        http:Response res = new;
        res.setJsonPayload(listWrites());
        return res;
    }
}

isolated function tokenError(int status, string errorCode) returns http:Response {
    http:Response res = new;
    res.statusCode = status;
    res.setJsonPayload({'error: errorCode});
    return res;
}

isolated function decodeBasic(string b64) returns string|error {
    byte[] bytes = check (check mime:base64Decode(b64.toBytes())).ensureType();
    return string:fromBytes(bytes);
}
