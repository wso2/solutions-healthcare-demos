// The simulator plays the reference lab's back office: it watches its own FHIR server for orders,
// "runs" them, files results there and tells the ordering integration the report is ready.

# Port the lab console API listens on.
configurable int port = 9093;

# Base URL of the lab's own FHIR server, the system of record for orders and results.
configurable string labFhirBaseUrl = "http://localhost:8082/fhir/r4";

# Id of the lab's Organization resource, used as the performer of every result.
configurable string labOrganizationId = "org-quest-lab";

# Name the lab presents on results and in the console.
configurable string labDisplayName = "Quest Diagnostics";

# Where to send notifications (specimen collected, report ready).
configurable string integrationWebhookUrl = "http://localhost:9090/api/lab/notifications";

# Key presented to the integration's webhook in the `X-Lab-Api-Key` header.
configurable string integrationWebhookApiKey = "demo-lab-webhook-key";

# Release results automatically this many seconds after the specimen is collected. 0 keeps every
# order waiting for the presenter to release it from the lab console.
configurable int autoReleaseSeconds = 0;

# Origins allowed to call the lab console API from a browser.
configurable string[] corsAllowOrigins = ["http://localhost:5173"];
