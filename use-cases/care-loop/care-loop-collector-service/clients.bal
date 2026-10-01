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

import care_loop/care_loop_common as common;
import ballerina/http;
import ballerinax/health.clients.fhir;

final fhir:FHIRConnector fhirConnector = check common:newFhirConnector(fhirServerUrl);
final http:Client aiClient = check new (aiServiceUrl);
final http:Client analysisClient = check new (analysisServiceUrl);

// http:Client defaults to HTTP_2_0, which probes with an h2c upgrade that Bun's HTTP server resets the connection on instead of answering - pinning HTTP_1_1 avoids it (verified 0/50 failures vs 50/50 before).
final http:Client whatsappClient = check new (whatsappUrl, httpVersion = http:HTTP_1_1);
final http:Client dashboardEventsClient = check common:newDashboardEventsClient(dashboardEventsUrl);

// Fire-and-forget: the ops dashboard is a nice-to-have live feed, never a reason to slow down or fail real pipeline work.
isolated function notifyDashboard(string patientId, common:DashboardEventLabel label, string? detail = (), map<string>? payload = ()) {
    common:notifyDashboard(dashboardEventsClient, patientId, label, detail, payload);
}

isolated function postWithRetry(http:Client 'client, string path, json body, typedesc<anydata> targetType)
        returns anydata|http:ClientError => common:postWithRetry('client, path, body, targetType);
