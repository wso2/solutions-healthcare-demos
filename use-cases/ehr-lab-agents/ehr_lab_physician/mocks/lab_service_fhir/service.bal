import ballerina/http;
import ballerina/log;

isolated function bundle(string t, json[] matches, json[] includes) returns json {
    json[] entries = [];
    foreach json r in matches {
        entries.push({fullUrl: publicBaseUrl + "/" + t + "/" + strOf(jpath(r, "id")), 'resource: r, 'search: {mode: "match"}});
    }
    foreach json r in includes {
        entries.push({fullUrl: publicBaseUrl + "/Observation/" + strOf(jpath(r, "id")), 'resource: r, 'search: {mode: "include"}});
    }
    return {
        resourceType: "Bundle",
        id: newUuid(),
        'type: "searchset",
        total: matches.length(),
        link: [{relation: "self", url: publicBaseUrl + "/" + t}],
        entry: entries
    };
}

isolated function createdResponse(json rsrc) returns http:Response {
    string id = strOf(jpath(rsrc, "id"));
    http:Response res = fhirResponse(201, rsrc);
    res.setHeader("Location", publicBaseUrl + "/ServiceRequest/" + id + "/_history/1");
    res.setHeader("ETag", "W/\"1\"");
    return res;
}

isolated function handleTransaction(json body) returns http:Response {
    if strOf(jpath(body, "resourceType")) != "Bundle" || strOf(jpath(body, "type")) != "transaction" {
        return outcome(422, "invalid", "Expected a Bundle of type 'transaction'");
    }
    json[] out = [];
    foreach json e in arr(jpath(body, "entry")) {
        json|string r = createOrder(jpath(e, "resource"));
        if r is string {
            out.push({response: {status: "422 Unprocessable Entity", outcome: outcomeJson("invalid", r)}});
        } else {
            string id = strOf(jpath(r, "id"));
            out.push({
                fullUrl: publicBaseUrl + "/ServiceRequest/" + id,
                'resource: r,
                response: {status: "201 Created", location: "ServiceRequest/" + id + "/_history/1", etag: "W/\"1\""}
            });
        }
    }
    return fhirResponse(200, {resourceType: "Bundle", id: newUuid(), 'type: "transaction-response", entry: out});
}

// Extracts the requested status from a PATCH body (JSON Patch array, or a partial resource).
isolated function patchedStatus(json body) returns string {
    if body is json[] {
        foreach json op in body {
            if strOf(jpath(op, "path")) == "/status" {
                return strOf(jpath(op, "value"));
            }
        }
        return "";
    }
    return strOf(jpath(body, "status"));
}

isolated function cancel(string id, json body) returns http:Response {
    string status = patchedStatus(body);
    if status != "revoked" {
        return outcome(422, "invalid", "Only status = 'revoked' (order cancellation) is supported");
    }
    [int, json] r = revokeOrder(id);
    return fhirResponse(r[0], r[1]);
}

// ── Admin handlers (served under /admin and /quest/fhir/r4/admin) ──
isolated function adminReleaseHandler(json body) returns http:Response {
    string scenario = body is map<json> && body["scenario"] is string ? strOf(body["scenario"]) : defaultScenario;
    if !isValidScenario(scenario) {
        return outcome(422, "invalid", "Unknown scenario: " + scenario);
    }
    string? placer = strOf(jpath(body, "placerOrderId")) == "" ? () : strOf(jpath(body, "placerOrderId"));
    string? filler = strOf(jpath(body, "fillerOrderId")) == "" ? () : strOf(jpath(body, "fillerOrderId"));
    string? encounter = strOf(jpath(body, "encounter")) == "" ? () : strOf(jpath(body, "encounter"));
    if placer is () && filler is () && encounter is () {
        return outcome(422, "invalid", "Provide placerOrderId, fillerOrderId or encounter");
    }
    string? reqId = findRequisition(placer, filler, encounter);
    if reqId is () {
        return outcome(404, "not-found", "No matching order");
    }
    decimal delay = numOf(jpath(body, "delaySeconds"));
    if delay > 0d {
        string|error s = scheduleRelease(reqId, scenario, delay);
        if s is error {
            return outcome(409, "conflict", s.message());
        }
        return fhirResponse(202, {requisition: reqId, scenario, status: "scheduled", releaseAt: s});
    }
    error? e = releaseRequisition(reqId, scenario);
    if e is error {
        return outcome(409, "conflict", e.message());
    }
    return fhirResponse(202, {requisition: reqId, scenario, status: "released", diagnosticReportId: "dr-" + reqId});
}

isolated function scheduleRelease(string reqId, string scenario, decimal delay) returns string|error {
    lock {
        json r = st.reqs[reqId];
        if r is () || jpath(r, "released") == true {
            return error("Requisition " + reqId + " is not releasable");
        }
        map<json> rm = <map<json>>r;
        decimal at = nowSecs() + delay;
        rm["releaseAt"] = at;
        rm["scenario"] = scenario;
        return secsToStr(at);
    }
}

isolated function adminResendHandler(json body) returns http:Response {
    string drId = lastSegment(strOf(jpath(body, "diagnosticReportId")));
    string? last = getLastNotification(drId);
    if last is () {
        return outcome(404, "not-found", "No notification sent yet for " + drId);
    }
    _ = start deliver(drId, last);
    return fhirResponse(202, {diagnosticReportId: drId, status: "resent"});
}

isolated function adminResetHandler() returns http:Response {
    resetState();
    return fhirResponse(200, {status: "reset"});
}

isolated function adminOrdersHandler() returns http:Response {
    http:Response res = new;
    res.setJsonPayload(orderSummaries());
    return res;
}

isolated function bodyOrEmpty(http:Request req) returns json {
    json|string b = parseBody(req);
    return b is string ? {} : b;
}

service / on new http:Listener(port) {

    function init() {
        _ = start schedulerLoop();
        log:printInfo("Mock Quest FHIR lab service started", port = port, autoRelease = autoRelease,
                resultDelaySeconds = resultDelaySeconds, defaultScenario = defaultScenario,
                payloadMode = payloadMode, notificationUrl = notificationUrl);
    }

    // ── Ordering ──
    resource function post quest/fhir/r4/ServiceRequest(http:Request req) returns http:Response {
        http:Response? g = checkApiKey(req);
        if g is http:Response {
            return g;
        }
        json|string body = parseBody(req);
        if body is string {
            return outcome(400, "invalid", body);
        }
        json|string r = createOrder(body);
        if r is string {
            return outcome(422, "invalid", r);
        }
        return createdResponse(r);
    }

    resource function post quest/fhir/r4(http:Request req) returns http:Response {
        http:Response? g = checkApiKey(req);
        if g is http:Response {
            return g;
        }
        json|string body = parseBody(req);
        if body is string {
            return outcome(400, "invalid", body);
        }
        return handleTransaction(body);
    }

    resource function get quest/fhir/r4/ServiceRequest/[string id](http:Request req) returns http:Response {
        http:Response? g = checkApiKey(req);
        if g is http:Response {
            return g;
        }
        json o = getOrder(id);
        if o is () {
            return outcome(404, "not-found", "ServiceRequest/" + id + " not found");
        }
        return fhirResponse(200, jpath(o, "resource"));
    }

    resource function get quest/fhir/r4/ServiceRequest(http:Request req) returns http:Response {
        http:Response? g = checkApiKey(req);
        if g is http:Response {
            return g;
        }
        string? ident = req.getQueryParamValue("identifier");
        json[] matches = [];
        foreach json o in listOrders() {
            json rs = jpath(o, "resource");
            boolean ok = ident is ();
            if ident is string {
                string sys = "";
                string val = ident;
                int? bar = ident.indexOf("|");
                if bar is int {
                    sys = ident.substring(0, bar);
                    val = ident.substring(bar + 1);
                }
                foreach json i in arr(jpath(rs, "identifier")) {
                    if strOf(jpath(i, "value")) == val && (sys == "" || strOf(jpath(i, "system")) == sys) {
                        ok = true;
                    }
                }
            }
            if ok {
                matches.push(rs);
            }
        }
        return fhirResponse(200, bundle("ServiceRequest", matches, []));
    }

    resource function patch quest/fhir/r4/ServiceRequest/[string id](http:Request req) returns http:Response {
        http:Response? g = checkApiKey(req);
        if g is http:Response {
            return g;
        }
        json|string body = parseBody(req);
        if body is string {
            return outcome(400, "invalid", body);
        }
        return cancel(id, body);
    }

    resource function put quest/fhir/r4/ServiceRequest/[string id](http:Request req) returns http:Response {
        http:Response? g = checkApiKey(req);
        if g is http:Response {
            return g;
        }
        json|string body = parseBody(req);
        if body is string {
            return outcome(400, "invalid", body);
        }
        return cancel(id, body);
    }

    // ── Reads ──
    resource function get quest/fhir/r4/DiagnosticReport/[string id](http:Request req) returns http:Response {
        http:Response? g = checkApiKey(req);
        if g is http:Response {
            return g;
        }
        json r = getReport(id);
        return r is () ? outcome(404, "not-found", "DiagnosticReport/" + id + " not found") : fhirResponse(200, r);
    }

    resource function get quest/fhir/r4/DiagnosticReport(http:Request req) returns http:Response {
        http:Response? g = checkApiKey(req);
        if g is http:Response {
            return g;
        }
        string? basedOn = req.getQueryParamValue("based-on");
        string? include = req.getQueryParamValue("_include");
        string[] candidates = [];
        if basedOn is string {
            int? bar = basedOn.indexOf("|");
            if bar is int {
                candidates.push(basedOn.substring(bar + 1));
            } else if basedOn.includes("/") {
                string oid = lastSegment(basedOn);
                candidates.push(oid);
                json o = getOrder(oid);
                if o !is () {
                    candidates.push(strOf(jpath(o, "placerValue")));
                    candidates.push(strOf(jpath(o, "fillerValue")));
                }
            } else {
                candidates.push(basedOn);
            }
        }
        json[] matches = [];
        json[] includes = [];
        foreach json dr in listReports() {
            boolean ok = basedOn is ();
            foreach json b in arr(jpath(dr, "basedOn")) {
                if candidates.indexOf(strOf(jpath(b, "identifier", "value"))) is int {
                    ok = true;
                }
            }
            if ok {
                matches.push(dr);
                if include == "DiagnosticReport:result" {
                    foreach json r in arr(jpath(dr, "result")) {
                        json obs = getObservation(lastSegment(strOf(jpath(r, "reference"))));
                        if obs !is () {
                            includes.push(obs);
                        }
                    }
                }
            }
        }
        return fhirResponse(200, bundle("DiagnosticReport", matches, includes));
    }

    resource function get quest/fhir/r4/Observation/[string id](http:Request req) returns http:Response {
        http:Response? g = checkApiKey(req);
        if g is http:Response {
            return g;
        }
        json o = getObservation(id);
        return o is () ? outcome(404, "not-found", "Observation/" + id + " not found") : fhirResponse(200, o);
    }

    resource function get quest/fhir/r4/Subscription/[string id](http:Request req) returns http:Response {
        http:Response? g = checkApiKey(req);
        if g is http:Response {
            return g;
        }
        if id != SUBSCRIPTION_ID {
            return outcome(404, "not-found", "Subscription/" + id + " not found");
        }
        return fhirResponse(200, subscriptionResource());
    }

    // ── Admin (root and under the FHIR base path) ──
    resource function get admin/orders() returns http:Response {
        return adminOrdersHandler();
    }

    resource function post admin/orders/\$release(http:Request req) returns http:Response {
        return adminReleaseHandler(bodyOrEmpty(req));
    }

    resource function post admin/notifications/\$resend(http:Request req) returns http:Response {
        return adminResendHandler(bodyOrEmpty(req));
    }

    resource function post admin/reset() returns http:Response {
        return adminResetHandler();
    }

    resource function get quest/fhir/r4/admin/orders() returns http:Response {
        return adminOrdersHandler();
    }

    resource function post quest/fhir/r4/admin/orders/\$release(http:Request req) returns http:Response {
        return adminReleaseHandler(bodyOrEmpty(req));
    }

    resource function post quest/fhir/r4/admin/notifications/\$resend(http:Request req) returns http:Response {
        return adminResendHandler(bodyOrEmpty(req));
    }

    resource function post quest/fhir/r4/admin/reset() returns http:Response {
        return adminResetHandler();
    }
}
