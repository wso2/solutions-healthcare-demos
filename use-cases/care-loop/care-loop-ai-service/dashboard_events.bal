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

import ballerina/http;

import care_loop/care_loop_common as common;

final http:Client dashboardEventsClient = check common:newDashboardEventsClient(dashboardEventsUrl);

# Fire-and-forget notification to the ops dashboard's live feed. Never allowed to affect this service's real work, so failures are only logged, never surfaced.
#
# + patientId - FHIR Patient id the event is about
# + label - short milestone label shown in the live feed
# + detail - optional extra context shown alongside the label
# + payload - optional structured key/value fields rendered in the dashboard's detail panel
function reportDashboardEvent(string patientId, common:DashboardEventLabel label, string? detail = (), map<string>? payload = ()) {
    common:notifyDashboard(dashboardEventsClient, patientId, label, detail, payload);
}
