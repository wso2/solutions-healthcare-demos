// Runtime configuration for the mock Quest Diagnostics FHIR R4 lab service.
configurable int port = 9092;
configurable string inboundApiKey = "quest-inbound-key";
// Where result notifications are pushed.
configurable string notificationUrl = "http://localhost:9090/longevity/fhir/r4/notifications/quest";
configurable string notificationApiKey = "demo-quest-key";
// HMAC-SHA256 key for the X-Quest-Signature header.
configurable string webhookSecret = "demo-quest-secret";
// "full-resource" or "id-only"
configurable string payloadMode = "full-resource";
configurable boolean autoRelease = true;
configurable int resultDelaySeconds = 20;
configurable string defaultScenario = "elevated-cardiometabolic-risk";
configurable string publicBaseUrl = "http://localhost:9092/quest/fhir/r4";

const FHIR_JSON = "application/fhir+json";
const LOINC = "http://loinc.org";
const UCUM = "http://unitsofmeasure.org";
const FILLER_SYSTEM = "urn:quest:order";
const SUBSCRIPTION_ID = "sub-wso2-longevity";
const TOPIC_URL = "http://quest.example.com/SubscriptionTopic/lab-result-available";
// Orders for one subject+encounter created within this many seconds form one requisition.
const decimal REQUISITION_WINDOW_SECONDS = 10;
