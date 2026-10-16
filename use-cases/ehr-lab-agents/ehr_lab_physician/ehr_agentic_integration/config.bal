// Configuration for the Longevity Care Workflow API.
// Defaults point at the local mock Cerner / Quest services so the integration
// works out of the box in the demo profile.

// ── Cerner (EHR) ──
configurable string cernerBaseUrl = "http://localhost:9091/cerner/fhir/r4";
configurable string cernerTokenUrl = "http://localhost:9091/oauth2/token";
configurable string cernerClientId = "longevity-integration";
configurable string cernerClientSecret = "demo-secret";
configurable string cernerScopes = "system/*.read system/*.write";
configurable decimal cernerTimeoutSeconds = 10;
configurable int cernerRetries = 2;

// ── Quest (Diagnostics) ──
configurable string questBaseUrl = "http://localhost:9092/quest/fhir/r4";
configurable string questApiKey = "quest-inbound-key";
configurable string questAdminUrl = "http://localhost:9092/quest/fhir/r4/admin";

// ── Webhook (inbound from Quest) ──
configurable string webhookApiKey = "demo-quest-key";
configurable string webhookHmacSecret = "demo-quest-secret";

// ── Workflow ──
configurable string workflowLabResultTimeout = "PT72H";
configurable string copilotProposalTtl = "PT15M";
configurable string idempotencyTtl = "PT24H";

// ── Security ──
configurable boolean securityEnabled = false;
configurable string securityJwksUrl = "";
configurable string securityDefaultPractitioner = "Practitioner/593923";

// ── AI ──
configurable string aiProvider = "";
configurable string aiModel = "";
configurable string aiApiKey = "";
configurable string aiMode = "rule-based";

// ── Demo ──
configurable boolean demoEnabled = true;

// ── Listener / API base ──
configurable int listenerPort = 9090;
configurable string apiBasePath = "/longevity/fhir/r4";
configurable string apiBaseUrl = "http://localhost:9090/longevity/fhir/r4";
