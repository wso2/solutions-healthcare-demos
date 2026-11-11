import ballerina/http;
import ballerina/url;

final readonly & string[] CONTROL_PARAMS = ["_count", "_sort", "_include", "_offset", "_format", "_summary"];

isolated function refId(json ref) returns string {
    return lastSegment(strOf(jpath(ref, "reference")));
}

isolated function codeMatches(json cc, string param) returns boolean {
    foreach string alt in re `,`.split(param) {
        string sys = "";
        string code = alt;
        int? bar = alt.indexOf("|");
        if bar is int {
            sys = alt.substring(0, bar);
            code = alt.substring(bar + 1);
        }
        foreach json c in arr(jpath(cc, "coding")) {
            if strOf(jpath(c, "code")) == code && (sys == "" || strOf(jpath(c, "system")) == sys) {
                return true;
            }
        }
    }
    return false;
}

isolated function anyCodeMatches(json ccs, string param) returns boolean {
    foreach json cc in arr(ccs) {
        if codeMatches(cc, param) {
            return true;
        }
    }
    return false;
}

isolated function dateMatches(string val, string param) returns boolean {
    if val == "" {
        return false;
    }
    string op = "eq";
    string d = param;
    if param.length() > 2 {
        string p = param.substring(0, 2);
        if p == "ge" || p == "le" || p == "gt" || p == "lt" || p == "eq" || p == "ne" {
            op = p;
            d = param.substring(2);
        }
    }
    int n = d.length();
    string v = val.length() >= n ? val.substring(0, n) : val;
    match op {
        "ge" => {
            return v >= d;
        }
        "le" => {
            return v <= d;
        }
        "gt" => {
            return v > d;
        }
        "lt" => {
            return v < d;
        }
        "ne" => {
            return v != d;
        }
    }
    return v == d;
}

isolated function entityDate(json r) returns string {
    foreach string f in ["effectiveDateTime", "onsetDateTime", "authoredOn", "date", "issued"] {
        string s = strOf(jpath(r, f));
        if s != "" {
            return s;
        }
    }
    return strOf(jpath(r, "period", "start"));
}

isolated function containsIgnoreCase(string s, string sub) returns boolean {
    return s.toLowerAscii().includes(sub.toLowerAscii());
}

isolated function patientNameMatches(json r, string fld, string param) returns boolean {
    foreach json n in arr(jpath(r, "name")) {
        if fld == "family" && containsIgnoreCase(strOf(jpath(n, "family")), param) {
            return true;
        }
        if fld == "given" {
            foreach json g in arr(jpath(n, "given")) {
                if containsIgnoreCase(strOf(g), param) {
                    return true;
                }
            }
        }
        if fld == "name" && (containsIgnoreCase(strOf(jpath(n, "text")), param) ||
                containsIgnoreCase(strOf(jpath(n, "family")), param) ||
                arr(jpath(n, "given")).some(g => containsIgnoreCase(strOf(g), param))) {
            return true;
        }
    }
    return false;
}

// Returns true when resource r satisfies one search parameter (all values AND-ed by the caller).
isolated function paramMatches(string t, json r, string key, string v) returns boolean {
    match key {
        "patient"|"subject" => {
            string subj = refId(jpath(r, "subject"));
            if subj == "" {
                subj = refId(jpath(r, "patient"));
            }
            if t == "Patient" {
                subj = strOf(jpath(r, "id"));
            }
            return subj == lastSegment(v);
        }
        "encounter" => {
            return refId(jpath(r, "encounter")) == lastSegment(v);
        }
        "status" => {
            return strOf(jpath(r, "status")) == v;
        }
        "clinical-status" => {
            return codeMatches(jpath(r, "clinicalStatus"), v);
        }
        "category" => {
            return anyCodeMatches(jpath(r, "category"), v);
        }
        "code" => {
            return codeMatches(jpath(r, "code"), v);
        }
        "type" => {
            json ty = jpath(r, "type");
            return ty is json[] ? anyCodeMatches(ty, v) : codeMatches(ty, v);
        }
        "date" => {
            return dateMatches(entityDate(r), v);
        }
        "based-on" => {
            string want = lastSegment(v);
            int? bar = v.indexOf("|");
            if bar is int {
                want = v.substring(bar + 1);
            }
            foreach json b in arr(jpath(r, "basedOn")) {
                if refId(b) == want || strOf(jpath(b, "identifier", "value")) == want {
                    return true;
                }
            }
            return false;
        }
        "family"|"given"|"name" => {
            return patientNameMatches(r, key, v);
        }
        "birthdate" => {
            return dateMatches(strOf(jpath(r, "birthDate")), v);
        }
        "gender" => {
            return strOf(jpath(r, "gender")) == v;
        }
        "identifier" => {
            string sys = "";
            string val = v;
            int? bar = v.indexOf("|");
            if bar is int {
                sys = v.substring(0, bar);
                val = v.substring(bar + 1);
            }
            foreach json i in arr(jpath(r, "identifier")) {
                if strOf(jpath(i, "value")) == val && (sys == "" || strOf(jpath(i, "system")) == sys) {
                    return true;
                }
            }
            return false;
        }
    }
    return true;
}

isolated function matchesAll(string t, json r, map<string[]> q) returns boolean {
    foreach [string, string[]] [key, vals] in q.entries() {
        if CONTROL_PARAMS.indexOf(key) is int {
            continue;
        }
        foreach string v in vals {
            // comma-separated OR applies to every param except code-like params handled inside codeMatches
            boolean ok = false;
            if key == "code" || key == "type" {
                ok = paramMatches(t, r, key, v);
            } else {
                foreach string alt in re `,`.split(v) {
                    if paramMatches(t, r, key, alt) {
                        ok = true;
                        break;
                    }
                }
            }
            if !ok {
                return false;
            }
        }
    }
    return true;
}

isolated function firstParam(map<string[]> q, string key) returns string? {
    string[]? v = q[key];
    return v is string[] && v.length() > 0 ? v[0] : ();
}

function search(string t, http:Request req) returns http:Response {
    map<string[]> q = req.getQueryParams();
    json[] matches = [];
    foreach json r in listResources(t) {
        if matchesAll(t, r, q) {
            matches.push(r);
        }
    }

    string? sort = firstParam(q, "_sort");
    if sort is string {
        boolean desc = sort.startsWith("-");
        string fld = desc ? sort.substring(1) : sort;
        if fld == "date" {
            matches = matches.sort(desc ? "descending" : "ascending", r => entityDate(r));
        }
    }

    int count = 50;
    string? c = firstParam(q, "_count");
    if c is string {
        int|error n = int:fromString(c);
        if n is int && n >= 0 {
            count = n;
        }
    }
    int offset = 0;
    string? o = firstParam(q, "_offset");
    if o is string {
        int|error n = int:fromString(o);
        if n is int && n >= 0 {
            offset = n;
        }
    }

    int total = matches.length();
    int end = offset + count < total ? offset + count : total;
    json[] page = offset < total ? matches.slice(offset, end) : [];

    json[] entries = [];
    map<boolean> seen = {};
    foreach json r in page {
        string id = strOf(jpath(r, "id"));
        seen[t + "/" + id] = true;
        entries.push({fullUrl: publicBaseUrl + "/" + t + "/" + id, 'resource: r, 'search: {mode: "match"}});
    }
    string[]? inc = q["_include"];
    if t == "DiagnosticReport" && inc is string[] && inc.indexOf("DiagnosticReport:result") is int {
        foreach json r in page {
            foreach json res in arr(jpath(r, "result")) {
                string oid = refId(res);
                if seen.hasKey("Observation/" + oid) {
                    continue;
                }
                json obs = getResource("Observation", oid);
                if obs !is () {
                    seen["Observation/" + oid] = true;
                    entries.push({fullUrl: publicBaseUrl + "/Observation/" + oid, 'resource: obs, 'search: {mode: "include"}});
                }
            }
        }
    }

    string self = publicBaseUrl + "/" + t + queryString(q, ());
    json[] links = [{relation: "self", url: self}];
    if end < total {
        links.push({relation: "next", url: publicBaseUrl + "/" + t + queryString(q, end)});
    }
    return fhirResponse(200, {
        resourceType: "Bundle",
        id: nextBundleId(),
        meta: {lastUpdated: nowStr()},
        'type: "searchset",
        total,
        link: links,
        entry: entries
    });
}

isolated function queryString(map<string[]> q, int? offset) returns string {
    string[] parts = [];
    foreach [string, string[]] [k, vs] in q.entries() {
        if k == "_offset" && offset is int {
            continue;
        }
        foreach string v in vs {
            string|error enc = url:encode(v, "UTF-8");
            parts.push(k + "=" + (enc is string ? enc : v));
        }
    }
    if offset is int {
        parts.push("_offset=" + offset.toString());
    }
    return parts.length() == 0 ? "" : "?" + string:'join("&", ...parts);
}

isolated function nextBundleId() returns string {
    return nextId();
}
