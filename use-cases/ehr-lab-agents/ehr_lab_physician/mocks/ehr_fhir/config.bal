// Runtime configuration for the mock Cerner Millennium FHIR R4 server.
configurable int port = 9091;
// Artificial delay (ms) applied to every FHIR call.
configurable int latencyMs = 150;
// 0.0 - 1.0; probability that a FHIR call fails with 503 + OperationOutcome (transient).
configurable decimal failureRate = 0.0;
configurable boolean requireAuth = true;
configurable string clientId = "longevity-integration";
configurable string clientSecret = "demo-secret";
configurable string publicBaseUrl = "http://localhost:9091/cerner/fhir/r4";

const FHIR_JSON = "application/fhir+json";
const MRN_SYSTEM = "urn:oid:2.16.840.1.113883.6.1000";
