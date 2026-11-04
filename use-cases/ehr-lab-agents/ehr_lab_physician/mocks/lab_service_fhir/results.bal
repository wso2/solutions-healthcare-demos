import ballerina/log;
import ballerina/lang.runtime;

const string PHASE_PARTIAL = "partial";
const string PHASE_FINAL = "final";
const string PHASE_CORRECTED = "corrected";

isolated function buildObservation(json ord, Result r, string status) returns json {
    string loinc = strOf(jpath(ord, "loinc"));
    TestDef t = TESTS.get(loinc);
    string id = "obs-" + strOf(jpath(ord, "id"));
    map<json> range = {};
    if t.low is decimal {
        range["low"] = {value: <decimal>t.low, unit: t.unit, system: UCUM, code: t.unit};
    }
    if t.high is decimal {
        range["high"] = {value: <decimal>t.high, unit: t.unit, system: UCUM, code: t.unit};
    }
    return {
        resourceType: "Observation",
        id,
        meta: {versionId: "1", lastUpdated: nowStr()},
        status,
        category: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory", display: "Laboratory"}]}],
        code: {coding: [{system: LOINC, code: loinc, display: t.name}], text: t.name},
        subject: {reference: strOf(jpath(ord, "subject"))},
        effectiveDateTime: strOf(jpath(ord, "collectedAt")),
        issued: nowStr(),
        performer: [{reference: "Organization/quest-diagnostics", display: "Quest Diagnostics"}],
        basedOn: [{reference: "ServiceRequest/" + strOf(jpath(ord, "id"))}],
        valueQuantity: {value: r.value, unit: t.unit, system: UCUM, code: t.unit},
        interpretation: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
            code: r.interp, display: interpDisplay(r.interp)}]}],
        referenceRange: [range]
    };
}

isolated function loadActive(string reqId) returns [json, json[]] {
    lock {
        json req = st.reqs[reqId].clone();
        json[] active = [];
        foreach json oid in arr(jpath(req, "orderIds")) {
            json o = st.orders[strOf(oid)];
            if o !is () && strOf(jpath(o, "status")) != "revoked" {
                active.push(o.clone());
            }
        }
        return [req.clone(), active.clone()];
    }
}

isolated function collectDue(decimal now) returns [string[][], json[]] {
    lock {
        string[][] dueReqs = [];
        json[] dueJobs = [];
        foreach [string, json] [k, v] in st.reqs.entries() {
            json at = jpath(v, "releaseAt");
            if jpath(v, "released") == false && at !is () && numOf(at) <= now {
                json sc = jpath(v, "scenario");
                dueReqs.push([k, sc is string ? sc : defaultScenario]);
            }
        }
        json[] keep = [];
        foreach json j in st.jobs {
            if numOf(jpath(j, "dueAt")) <= now {
                dueJobs.push(j.clone());
            } else {
                keep.push(j);
            }
        }
        st.jobs = keep;
        return [dueReqs.clone(), dueJobs.clone()];
    }
}

// Builds / rebuilds the DiagnosticReport + Observations for a requisition and stores them.
// phase: partial (ApoB only), final (all) or corrected (all, ApoB re-issued as 118).
isolated function produce(string reqId, string base, string phase) returns string|error {
    [json, json[]] loaded = loadActive(reqId);
    json req = loaded[0];
    json[] active = loaded[1];
    if active.length() == 0 {
        return error("No active orders in requisition " + reqId);
    }

    json[] selected = active;
    if phase == PHASE_PARTIAL {
        json pick = active[0];
        foreach json o in active {
            if strOf(jpath(o, "loinc")) == "1884-6" {
                pick = o;
            }
        }
        selected = [pick];
    }

    map<Result> values = SCENARIOS.get(baseScenario(base));
    string obsStatus = phase == PHASE_CORRECTED ? "corrected" : "final";
    json[] observations = [];
    json[] resultRefs = [];
    json[] basedOn = [];
    string[] abnormal = [];
    string critical = "";
    foreach json o in selected {
        string loinc = strOf(jpath(o, "loinc"));
        Result r = values.get(loinc);
        if phase == PHASE_CORRECTED && loinc == "1884-6" {
            r = {value: 118, interp: "H"};
        }
        json obs = buildObservation(o, r, obsStatus);
        observations.push(obs);
        resultRefs.push({reference: "Observation/" + strOf(jpath(obs, "id"))});
        TestDef t = TESTS.get(loinc);
        if r.interp != "N" {
            abnormal.push(t.name + " " + r.value.toString() + " " + t.unit + " (" + r.interp + ")");
        }
        if r.interp == "HH" || r.interp == "LL" {
            critical = "CRITICAL VALUE: " + t.name + " " + r.value.toString() + " " + t.unit + ". ";
        }
    }
    foreach json o in active {
        string sys = strOf(jpath(o, "placerSystem"));
        basedOn.push({identifier: {
            'type: {coding: [{system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "PLAC"}]},
            system: sys,
            value: strOf(jpath(o, "placerValue"))
        }});
        basedOn.push({identifier: {
            'type: {coding: [{system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "FILL"}]},
            system: FILLER_SYSTEM,
            value: strOf(jpath(o, "fillerValue"))
        }});
    }

    string drId = "dr-" + reqId;
    string drStatus = phase == PHASE_PARTIAL ? "partial" : phase == PHASE_CORRECTED ? "corrected" : "final";
    string conclusion = abnormal.length() == 0
        ? "All results within reference range."
        : critical + abnormal.length().toString() + " of " + observations.length().toString()
            + " results outside reference range: " + string:'join("; ", ...abnormal) + ".";
    if phase == PHASE_PARTIAL {
        conclusion = "Preliminary report: remaining results pending. " + conclusion;
    }
    string seqPart = reqId.substring(4);

    string subjectRef = strOf(jpath(req, "subject"));
    string collected = strOf(jpath(active[0], "collectedAt"));
    json[] obsToStore = observations.clone();
    json[] refsToStore = resultRefs.clone();
    json[] basedOnToStore = basedOn.clone();
    lock {
        json existing = st.reports[drId];
        int version = existing is () ? 1 : <int>(check_int(jpath(existing, "meta", "versionId")) + 1);
        foreach json obs in obsToStore.clone() {
            st.observations[strOf(jpath(obs, "id"))] = obs.clone();
        }
        st.reports[drId] = {
            resourceType: "DiagnosticReport",
            id: drId,
            meta: {versionId: version.toString(), lastUpdated: nowStr()},
            identifier: [{system: "urn:quest:accession", value: "ACC-" + seqPart}],
            basedOn: basedOnToStore.clone(),
            status: drStatus,
            category: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB", display: "Laboratory"}]}],
            code: {coding: [{system: LOINC, code: "11502-2", display: "Laboratory report"}], text: "Longevity biomarker panel"},
            subject: {reference: subjectRef},
            effectiveDateTime: collected,
            issued: nowStr(),
            performer: [{reference: "Organization/quest-diagnostics", display: "Quest Diagnostics"}],
            result: refsToStore.clone(),
            conclusion
        };
        if phase == PHASE_PARTIAL {
            map<json> rq = <map<json>>st.reqs.get(reqId);
            rq["released"] = true;
        }
    }
    return drId;
}

isolated function check_int(json v) returns int {
    if v is string {
        int|error n = int:fromString(v);
        return n is int ? n : 1;
    }
    return v is int ? v : 1;
}

// Releases a requisition now using the scenario; schedules follow-up notifications for special scenarios.
isolated function releaseRequisition(string reqId, string scenario) returns error? {
    lock {
        json r = st.reqs[reqId];
        if r is () {
            return error("Requisition " + reqId + " not found");
        }
        if jpath(r, "released") == true {
            return error("Requisition " + reqId + " was already released");
        }
        map<json> rm = <map<json>>r;
        rm["released"] = true;
        rm["releaseAt"] = ();
    }
    string base = baseScenario(scenario);
    string first = scenario == SCENARIO_PARTIAL ? PHASE_PARTIAL : PHASE_FINAL;
    string drId = check produce(reqId, base, first);
    log:printInfo("Released requisition", requisition = reqId, scenario = scenario, diagnosticReport = drId, status = first);
    notifyReport(drId);
    if scenario == SCENARIO_PARTIAL {
        addJob({dueAt: nowSecs() + 10d, reqId, base, phase: PHASE_FINAL});
    } else if scenario == SCENARIO_CORRECTED {
        addJob({dueAt: nowSecs() + 15d, reqId, base, phase: PHASE_CORRECTED});
    }
}

isolated function runJob(json job) {
    string reqId = strOf(jpath(job, "reqId"));
    string|error drId = produce(reqId, strOf(jpath(job, "base")), strOf(jpath(job, "phase")));
    if drId is error {
        log:printError("Follow-up result failed", drId);
        return;
    }
    log:printInfo("Follow-up result issued", requisition = reqId, phase = strOf(jpath(job, "phase")));
    notifyReport(drId);
}

// Scheduler: auto-releases requisitions and runs delayed follow-up jobs.
isolated function schedulerLoop() {
    while true {
        runtime:sleep(1);
        [string[][], json[]] due = collectDue(nowSecs());
        string[][] dueReqs = due[0];
        json[] dueJobs = due[1];
        foreach string[] d in dueReqs {
            error? e = releaseRequisition(d[0], d[1]);
            if e is error {
                log:printWarn("Auto-release skipped", reason = e.message());
            }
        }
        foreach json j in dueJobs {
            runJob(j);
        }
    }
}
