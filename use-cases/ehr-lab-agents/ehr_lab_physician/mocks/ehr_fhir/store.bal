import ballerina/uuid;

// resourceType -> id -> resource
isolated map<map<json>> store = {};
isolated int idCounter = 90000000;
isolated map<string> tokens = {};

type WriteEntry record {|
    string action;
    string resourceType;
    string id;
    int versionId;
    string timestamp;
|};

isolated WriteEntry[] writes = [];

isolated function nextId() returns string {
    lock {
        idCounter += 1;
        return idCounter.toString();
    }
}

isolated function putResource(string t, string id, json res) {
    lock {
        map<json>? m = store[t];
        if m is () {
            store[t] = {};
        }
        map<json> target = store.get(t);
        target[id] = res.clone();
    }
}

isolated function getResource(string t, string id) returns json {
    lock {
        map<json>? m = store[t];
        if m is map<json> {
            return m[id].clone();
        }
        return ();
    }
}

isolated function listResources(string t) returns json[] {
    lock {
        map<json>? m = store[t];
        if m is map<json> {
            return m.clone().toArray();
        }
        return [];
    }
}

isolated function isSupportedType(string t) returns boolean {
    return SUPPORTED_TYPES.indexOf(t) is int;
}

isolated function recordWrite(string action, string t, string id, int versionId) {
    lock {
        writes.unshift({action, resourceType: t, id, versionId, timestamp: nowStr()});
    }
}

isolated function listWrites() returns json {
    lock {
        return writes.clone().toJson();
    }
}

isolated function issueToken() returns string {
    string tok = uuid:createType4AsString();
    lock {
        tokens[tok] = nowStr();
    }
    return tok;
}

isolated function isValidToken(string tok) returns boolean {
    lock {
        return tokens.hasKey(tok);
    }
}

isolated function resetStore() {
    lock {
        store = {};
    }
    lock {
        idCounter = 90000000;
    }
    lock {
        writes = [];
    }
    loadSeed();
}
