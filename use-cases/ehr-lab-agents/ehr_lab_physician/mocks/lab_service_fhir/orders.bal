import ballerina/random;

isolated function numOf(json j) returns decimal {
    if j is decimal {
        return j;
    }
    if j is int {
        return <decimal>j;
    }
    if j is float {
        return <decimal>j;
    }
    return 0d;
}

isolated function identifierOfType(json rsrc, string typeCode) returns json {
    foreach json i in arr(jpath(rsrc, "identifier")) {
        foreach json c in arr(jpath(i, "type", "coding")) {
            if strOf(jpath(c, "code")) == typeCode {
                return i;
            }
        }
    }
    return ();
}

isolated function loincOf(json rsrc) returns string {
    foreach json c in arr(jpath(rsrc, "code", "coding")) {
        if strOf(jpath(c, "system")) == LOINC {
            return strOf(jpath(c, "code"));
        }
    }
    return "";
}

// Validates and stores one ServiceRequest. Returns the stored rsrc, or an error message (-> 422).
isolated function createOrder(json body) returns json|string {
    if strOf(jpath(body, "resourceType")) != "ServiceRequest" {
        return "resourceType must be ServiceRequest";
    }
    if strOf(jpath(body, "status")) != "active" {
        return "ServiceRequest.status must be 'active'";
    }
    if strOf(jpath(body, "intent")) != "order" {
        return "ServiceRequest.intent must be 'order'";
    }
    string subject = strOf(jpath(body, "subject", "reference"));
    if subject == "" {
        return "ServiceRequest.subject is required";
    }
    string loinc = loincOf(body);
    if loinc == "" {
        return "ServiceRequest.code must contain a LOINC coding (" + LOINC + ")";
    }
    if !TESTS.hasKey(loinc) {
        return "Unsupported LOINC code: " + loinc;
    }
    json placer = identifierOfType(body, "PLAC");
    if placer is () || strOf(jpath(placer, "value")) == "" {
        return "ServiceRequest.identifier with type PLAC (placer order number) is required";
    }

    int|error n = random:createIntInRange(10000000, 100000000);
    string fillerValue = "Q-" + (n is int ? n : 12345678).toString();
    string id = nextSeq().toString();
    int reqSeq = nextSeq();
    decimal now = nowSecs();
    string encounter = strOf(jpath(body, "encounter", "reference"));

    map<json> rsrc = checkpanic body.cloneWithType();
    rsrc["id"] = id;
    rsrc["meta"] = {versionId: "1", lastUpdated: nowStr()};
    json[] ids = arr(rsrc["identifier"]).clone();
    ids.push({
        'type: {coding: [{system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "FILL"}]},
        system: FILLER_SYSTEM,
        value: fillerValue
    });
    rsrc["identifier"] = ids;

    string placerSystem = strOf(jpath(placer, "system"));
    string placerValue = strOf(jpath(placer, "value"));
    lock {
        string reqId = "";
        foreach [string, json] [k, v] in st.reqs.entries() {
            if jpath(v, "released") == false && strOf(jpath(v, "subject")) == subject
                    && strOf(jpath(v, "encounter")) == encounter
                    && now - numOf(jpath(v, "lastCreated")) <= REQUISITION_WINDOW_SECONDS {
                reqId = k;
                break;
            }
        }
        if reqId == "" {
            reqId = "req-" + reqSeq.toString();
            st.reqs[reqId] = {id: reqId, subject, encounter, orderIds: [], lastCreated: now, releaseAt: (), released: false, scenario: ()};
        }
        map<json> req = <map<json>>st.reqs.get(reqId);
        (<json[]>req["orderIds"]).push(id);
        req["lastCreated"] = now;
        if autoRelease {
            req["releaseAt"] = now + <decimal>resultDelaySeconds;
        }
        st.orders[id] = {
            id,
            rsrc: rsrc.clone(),
            placerSystem,
            placerValue,
            fillerValue,
            status: "received",
            requisitionId: reqId,
            encounter,
            subject,
            loinc,
            createdAt: now,
            collectedAt: secsToStr(now)
        };
    }
    return rsrc;
}

// Cancels an order (status = revoked). Returns the updated rsrc or an error message with status code.
isolated function revokeOrder(string id) returns [int, json] {
    lock {
        json o = st.orders[id];
        if o is () {
            return [404, outcomeJson("not-found", "ServiceRequest/" + id + " not found")];
        }
        string reqId = strOf(jpath(o, "requisitionId"));
        json r = st.reqs[reqId];
        if jpath(r, "released") == true {
            return [409, outcomeJson("conflict", "Results were already produced for this order")];
        }
        map<json> om = <map<json>>o;
        om["status"] = "revoked";
        map<json> res = <map<json>>om["rsrc"];
        res["status"] = "revoked";
        res["meta"] = {versionId: "2", lastUpdated: nowStr()};
        return [200, res.clone()];
    }
}

isolated function orderSummaries() returns json[] {
    json[] out = [];
    foreach json o in listOrders() {
        json r = getReq(strOf(jpath(o, "requisitionId")));
        json releaseAt = jpath(r, "releaseAt");
        out.push({
            id: strOf(jpath(o, "id")),
            requisition: strOf(jpath(o, "requisitionId")),
            placerOrderId: strOf(jpath(o, "placerValue")),
            fillerOrderId: strOf(jpath(o, "fillerValue")),
            loinc: strOf(jpath(o, "loinc")),
            encounter: strOf(jpath(o, "encounter")),
            status: strOf(jpath(o, "status")),
            released: jpath(r, "released") == true,
            scheduledRelease: releaseAt is () ? () : secsToStr(numOf(releaseAt)),
            diagnosticReportId: jpath(r, "released") == true ? "dr-" + strOf(jpath(o, "requisitionId")) : ()
        });
    }
    return out;
}

// Finds the (unreleased preferred) requisition matching placer / filler / encounter.
isolated function findRequisition(string? placer, string? filler, string? encounter) returns string? {
    string? found = ();
    foreach json o in listOrders() {
        boolean ok = (placer is string && strOf(jpath(o, "placerValue")) == placer)
            || (filler is string && strOf(jpath(o, "fillerValue")) == filler)
            || (encounter is string && encounter != ""
                && (strOf(jpath(o, "encounter")) == encounter || lastSegment(strOf(jpath(o, "encounter"))) == lastSegment(encounter)));
        if ok {
            string rid = strOf(jpath(o, "requisitionId"));
            json r = getReq(rid);
            if jpath(r, "released") == false {
                return rid;
            }
            found = rid;
        }
    }
    return found;
}
