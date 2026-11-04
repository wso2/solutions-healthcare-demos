import ballerina/uuid;

type State record {|
    map<json> orders;
    map<json> reqs;
    map<json> reports;
    map<json> observations;
    map<string> lastNotif;
    json[] jobs;
    int eventNo;
    int seq;
|};

isolated State st = {orders: {}, reqs: {}, reports: {}, observations: {}, lastNotif: {}, jobs: [], eventNo: 0, seq: 1000};

isolated function resetState() {
    lock {
        st = {orders: {}, reqs: {}, reports: {}, observations: {}, lastNotif: {}, jobs: [], eventNo: 0, seq: 1000};
    }
}

isolated function nextSeq() returns int {
    lock {
        st.seq += 1;
        return st.seq;
    }
}

isolated function nextEventNo() returns int {
    lock {
        st.eventNo += 1;
        return st.eventNo;
    }
}

isolated function getOrder(string id) returns json {
    lock {
        return st.orders[id].clone();
    }
}

isolated function listOrders() returns json[] {
    lock {
        return st.orders.clone().toArray();
    }
}

isolated function getReq(string id) returns json {
    lock {
        return st.reqs[id].clone();
    }
}

isolated function getReport(string id) returns json {
    lock {
        return st.reports[id].clone();
    }
}

isolated function listReports() returns json[] {
    lock {
        return st.reports.clone().toArray();
    }
}

isolated function getObservation(string id) returns json {
    lock {
        return st.observations[id].clone();
    }
}

isolated function setLastNotification(string drId, string body) {
    lock {
        st.lastNotif[drId] = body;
    }
}

isolated function getLastNotification(string drId) returns string? {
    lock {
        return st.lastNotif[drId];
    }
}

isolated function addJob(json job) {
    lock {
        st.jobs.push(job.clone());
    }
}

isolated function newUuid() returns string {
    return uuid:createType4AsString();
}
