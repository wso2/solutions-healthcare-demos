// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

// Each bundle only ever carries one patient's readings, so the first entry's subject reference is enough.
isolated function extractPatientIdFromVitalsBundle(json bundle) returns string|error {
    json[] entries = check trap <json[]>(checkpanic bundle.entry);
    if entries.length() == 0 {
        return error("vitals bundle has no entries");
    }
    string reference = check trap <string>(checkpanic entries[0].'resource.subject.reference);
    if !reference.startsWith("Patient/") {
        return error("unexpected subject reference: " + reference);
    }
    return reference.substring("Patient/".length());
}

// Best-effort: pulls whatever real fields the first entry's Observation actually has, skipping any that are absent rather than guessing (e.g. a panel-shaped Observation with no single valueQuantity).
isolated function extractVitalsDashboardPayload(json bundle) returns map<string> {
    map<string> payload = {"source": "Apple HealthKit"};
    json[]|error entries = trap <json[]>checkpanic bundle.entry;
    if entries is error || entries.length() == 0 {
        return payload;
    }
    json 'resource = checkpanic entries[0].'resource;

    string|error display = trap extractFirstCodingDisplay('resource);
    if display is string {
        payload["metric"] = display;
    }

    decimal|error value = trap <decimal>checkpanic 'resource.valueQuantity.value;
    if value is decimal {
        payload["value"] = value.toString();
    }

    string|error unit = trap <string>checkpanic 'resource.valueQuantity.unit;
    if unit is string {
        payload["unit"] = unit;
    }

    return payload;
}

isolated function extractFirstCodingDisplay(json 'resource) returns string {
    json[] codings = <json[]>checkpanic 'resource.code.coding;
    return <string>checkpanic codings[0].display;
}
