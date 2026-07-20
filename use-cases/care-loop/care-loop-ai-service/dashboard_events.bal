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
