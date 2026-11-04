# Demo mocks

Standalone Ballerina services standing in for the EHR and the lab. Each is an independent package with no external dependencies.

| Package | Simulates | Port | Base path |
|---|---|---|---|
| `ehr_fhir` | Cerner Millennium FHIR R4 (SMART backend auth) | 9091 | `/cerner/fhir/r4` |
| `lab_service_fhir` | Quest Diagnostics lab orders + result push notifications | 9092 | `/quest/fhir/r4` |

## Quick start (for agents)

Requires Ballerina 2201.13.4+ and Java. Defaults work out of the box; `Config.toml` in each package already holds the default values.

```bash
# terminal 1
cd mocks/ehr_fhir && bal run          # listens on :9091
# terminal 2
cd mocks/lab_service_fhir && bal run  # listens on :9092
```

Background start + readiness check:

```bash
(cd mocks/ehr_fhir && bal run > /tmp/ehr.log 2>&1 &)
(cd mocks/lab_service_fhir && bal run > /tmp/quest.log 2>&1 &)
until curl -s -o /dev/null -w '%{http_code}' -X POST localhost:9092/admin/reset | grep -q 200; do sleep 2; done
until curl -s -o /dev/null -w '%{http_code}' -X POST localhost:9091/admin/reset | grep -q 200; do sleep 2; done
```

Stop: `pkill -f ehr_fhir.jar; pkill -f lab_service_fhir.jar` (or Ctrl+C). To use a different config file: `bal run -- -Cport=9191` or set `BAL_CONFIG_FILES=/path/Config.toml`.

The integration (`ehr_agentic_integration`) defaults already point at these ports. For it to receive Quest notifications it must listen on `localhost:9090` at `/longevity/fhir/r4/notifications/quest` (Quest `notificationUrl`).

## Sample configs

### `ehr_fhir/Config.toml` (defaults)

```toml
port = 9091
latencyMs = 150              # artificial delay per FHIR call
failureRate = 0.0            # 0.0-1.0; probability of 503 OperationOutcome (transient)
requireAuth = true           # false = no bearer token needed
clientId = "longevity-integration"
clientSecret = "demo-secret"
publicBaseUrl = "http://localhost:9091/cerner/fhir/r4"   # used in Bundle links / Location
```

Fast, no-auth dev profile: `latencyMs = 0`, `requireAuth = false`.
Error-handling demo: `failureRate = 0.3`.

### `lab_service_fhir/Config.toml` (defaults)

```toml
port = 9092
inboundApiKey = "quest-inbound-key"      # X-API-Key required on FHIR calls
notificationUrl = "http://localhost:9090/longevity/fhir/r4/notifications/quest"
notificationApiKey = "demo-quest-key"    # sent as X-API-Key on notifications
webhookSecret = "demo-quest-secret"      # HMAC-SHA256 key for X-Quest-Signature
payloadMode = "full-resource"            # or "id-only"
autoRelease = true                       # release results automatically
resultDelaySeconds = 20
defaultScenario = "elevated-cardiometabolic-risk"
publicBaseUrl = "http://localhost:9092/quest/fhir/r4"
```

Manual-trigger demo: `autoRelease = false`, then release via `$release` (below).
Quick demo: `resultDelaySeconds = 3`.
Scenarios: `normal`, `elevated-cardiometabolic-risk`, `critical-value`, `partial-then-final`, `corrected`.

## Smoke tests

```bash
# EHR: token, then Nancy
TOK=$(curl -s -X POST localhost:9091/oauth2/token \
  -d grant_type=client_credentials -d client_id=longevity-integration -d client_secret=demo-secret \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s -H "Authorization: Bearer $TOK" "localhost:9091/cerner/fhir/r4/Patient?family=SMART&given=NANCY"
curl -s -H "Authorization: Bearer $TOK" \
  "localhost:9091/cerner/fhir/r4/Observation?patient=12724066&code=http://loinc.org|13457-7&_sort=date"
curl -s -H "Authorization: Bearer $TOK" localhost:9091/admin/writes

# Lab: place an order, release it now
curl -s -X POST localhost:9092/quest/fhir/r4/ServiceRequest -H 'X-API-Key: quest-inbound-key' -d '{
  "resourceType":"ServiceRequest","status":"active","intent":"order",
  "subject":{"reference":"Patient/12724066"},"encounter":{"reference":"Encounter/E1"},
  "code":{"coding":[{"system":"http://loinc.org","code":"1884-6"}]},
  "identifier":[{"type":{"coding":[{"code":"PLAC"}]},"system":"urn:demo:placer","value":"P1"}]}'
curl -s localhost:9092/admin/orders
curl -s -X POST 'localhost:9092/admin/orders/$release' \
  -d '{"encounter":"Encounter/E1","scenario":"critical-value","delaySeconds":0}'
```

## ehr_fhir details
- Token: `POST /oauth2/token` (form `grant_type=client_credentials`, `client_id`, `client_secret`), then `Authorization: Bearer <token>`.
- Seed: Nancy Smart `12724066` (worsening LDL / HbA1c / hs-CRP over 3 years), Fred Smart `12724067`, Priya Jones `12724068`; Practitioner `593923`.
- `POST /admin/reset` restores seed data; `GET /admin/writes` lists created/updated resources.

## lab_service_fhir details
- Orders: `POST /ServiceRequest` or a `transaction` Bundle to the base path, header `X-API-Key`. Needs `status=active`, `intent=order`, `subject`, a LOINC code, and a PLAC identifier.
- Orders for the same subject + encounter created within 10 s form one requisition and one DiagnosticReport.
- Each result is pushed to `notificationUrl` as a Subscriptions Backport `history` Bundle with `X-API-Key` and `X-Quest-Signature: sha256=<HMAC-SHA256(raw body, webhookSecret)>`; retried at 2/4/8 s; a 404 is not retried.
- Admin endpoints (no auth), at both `/admin/...` and `/quest/fhir/r4/admin/...`:
  `GET /admin/orders`, `POST /admin/orders/$release` (`placerOrderId` | `fillerOrderId` | `encounter`, `scenario`, `delaySeconds`),
  `POST /admin/notifications/$resend` (`diagnosticReportId`), `POST /admin/reset`.
- Supported LOINC: 1884-6, 10835-7, 20448-7, 1558-6, 4548-4, 13457-7, 2085-9, 2571-8, 30522-7, 62292-8.

## Troubleshooting
- `Address already in use`: another instance is running; stop it (see above) or change `port`.
- Notifications failing with connection errors: nothing is listening on `notificationUrl`; Quest logs each retry attempt.
- 401 from Quest: missing/incorrect `X-API-Key`. 401 from Cerner: missing/expired bearer token.
