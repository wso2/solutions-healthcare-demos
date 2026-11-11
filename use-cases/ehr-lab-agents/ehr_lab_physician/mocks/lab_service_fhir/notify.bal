import ballerina/crypto;
import ballerina/http;
import ballerina/lang.runtime;
import ballerina/log;

final readonly & decimal[] BACKOFF_SECONDS = [2, 4, 8];

isolated function subscriptionUrl() returns string {
    return publicBaseUrl + "/Subscription/" + SUBSCRIPTION_ID;
}

isolated function subscriptionResource() returns json {
    return {
        resourceType: "Subscription",
        id: SUBSCRIPTION_ID,
        meta: {profile: ["http://hl7.org/fhir/uv/subscriptions-backport/StructureDefinition/backport-subscription"]},
        status: "active",
        reason: "Notify the longevity integration when a lab report is available",
        criteria: TOPIC_URL,
        _criteria: {extension: [{
            url: "http://hl7.org/fhir/uv/subscriptions-backport/StructureDefinition/backport-topic-canonical",
            valueUri: TOPIC_URL
        }]},
        channel: {
            'type: "rest-hook",
            endpoint: notificationUrl,
            payload: "application/fhir+json",
            header: ["X-API-Key: " + notificationApiKey]
        }
    };
}

// Builds the subscriptions-backport history Bundle for a DiagnosticReport.
isolated function buildNotification(string drId) returns string|error {
    json dr = getReport(drId);
    if dr is () {
        return error("DiagnosticReport " + drId + " not found");
    }
    string focus = publicBaseUrl + "/DiagnosticReport/" + drId;
    int eventNo = nextEventNo();
    string ts = nowStr();
    json[] entries = [{
        fullUrl: "urn:uuid:" + newUuid(),
        'resource: {
            resourceType: "Parameters",
            id: newUuid(),
            meta: {profile: ["http://hl7.org/fhir/uv/subscriptions-backport/StructureDefinition/backport-subscription-status-r4"]},
            'parameter: [
                {name: "subscription", valueReference: {reference: subscriptionUrl()}},
                {name: "topic", valueCanonical: TOPIC_URL},
                {name: "status", valueCode: "active"},
                {name: "type", valueCode: "event-notification"},
                {name: "notification-event", part: [
                    {name: "event-number", valueString: eventNo.toString()},
                    {name: "timestamp", valueInstant: ts},
                    {name: "focus", valueReference: {reference: focus}}
                ]}
            ]
        },
        request: {method: "GET", url: subscriptionUrl() + "/$status"},
        response: {status: "200"}
    }];
    if payloadMode != "id-only" {
        entries.push({
            fullUrl: focus,
            'resource: dr,
            request: {method: "GET", url: focus},
            response: {status: "200"}
        });
        foreach json r in arr(jpath(dr, "result")) {
            string oid = lastSegment(strOf(jpath(r, "reference")));
            json obs = getObservation(oid);
            if obs !is () {
                string url = publicBaseUrl + "/Observation/" + oid;
                entries.push({fullUrl: url, 'resource: obs, request: {method: "GET", url}, response: {status: "200"}});
            }
        }
    }
    json bundle = {
        resourceType: "Bundle",
        id: newUuid(),
        'type: "history",
        timestamp: ts,
        entry: entries
    };
    return bundle.toJsonString();
}

// Builds, remembers and asynchronously delivers the notification for a report.
isolated function notifyReport(string drId) {
    string|error body = buildNotification(drId);
    if body is error {
        log:printError("Could not build notification", body);
        return;
    }
    setLastNotification(drId, body);
    _ = start deliver(drId, body);
}

isolated function signature(string body) returns string {
    byte[] mac = checkpanic crypto:hmacSha256(body.toBytes(), webhookSecret.toBytes());
    return "sha256=" + mac.toBase16();
}

// Delivers a notification with 3 retries (2s, 4s, 8s). A 404 means "no waiting session" and is not retried.
isolated function deliver(string drId, string body) {
    http:Client|error c = new (notificationUrl, {timeout: 15});
    if c is error {
        log:printError("Invalid notificationUrl", c);
        return;
    }
    string sig = signature(body);
    int attempt = 0;
    while true {
        http:Request req = new;
        req.setTextPayload(body, FHIR_JSON);
        req.setHeader("X-API-Key", notificationApiKey);
        req.setHeader("X-Quest-Signature", sig);
        http:Response|error res = c->post("", req);
        string failure;
        if res is http:Response {
            if res.statusCode >= 200 && res.statusCode < 300 {
                log:printInfo("Notification delivered", diagnosticReport = drId, attempt = attempt + 1, status = res.statusCode);
                return;
            }
            if res.statusCode == 404 {
                log:printInfo("Notification not retried: no waiting session (404)", diagnosticReport = drId);
                return;
            }
            failure = "HTTP " + res.statusCode.toString();
        } else {
            failure = res.message();
        }
        log:printWarn("Notification attempt failed", diagnosticReport = drId, attempt = attempt + 1, reason = failure);
        if attempt >= BACKOFF_SECONDS.length() {
            log:printError("Notification gave up after retries", diagnosticReport = drId);
            return;
        }
        runtime:sleep(BACKOFF_SECONDS[attempt]);
        attempt += 1;
    }
}
