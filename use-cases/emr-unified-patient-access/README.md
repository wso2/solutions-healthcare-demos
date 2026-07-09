# UnifiedCare — Epic & Cerner EMR Integration Demo

A cross-EMR patient access API built with **WSO2 Ballerina healthcare libraries**, showcasing
system-to-system (SMART Backend Services) integration with the **Epic** and
**Cerner (Oracle Health)** FHIR R4 sandboxes.

## Use case

A regional care network runs its tertiary hospital on Epic and its community clinics on
Cerner. Care coordinators get **one EMR-agnostic API context** — every patient operation
fans out to both EMRs in parallel and combines whatever each system returns:

1. **Unified lookup** (`GET /patients/{id}`): resolves the id against Epic AND Cerner;
   `foundIn` reports where the patient lives, misses become `warnings`.
2. **Unified search** (`GET /patients?family=&given=&birthdate=`): merges demographic
   matches from both EMRs (`sourceEmr` marks each record's origin).
3. **Unified Patient-360** (`GET /patients/{id}/summary`): aggregates conditions,
   medications, allergies, vitals and labs wherever the id resolves, then
   **demographically links the same person in the other EMR** (family name + birthDate)
   and aggregates there too — one clinical view per EMR, joined in one response.
4. **Referral** (`POST /referrals`): pulls the full clinical packet from the source EMR
   and matches the patient in the receiving EMR (`MATCH_FOUND` with candidate ids, or
   `NO_MATCH` → new-patient packet).

The entire flow is **read-only** — no writes are made to either sandbox. Every EMR
interaction is logged to the console (request, HTTP status, latency, raw FHIR snippet,
entry counts, link decisions) so a demo audience can watch live data arriving from both
sandboxes.

```
                        ┌──────────────────────────────┐   SMART Backend Auth + FHIR
        REST/JSON       │  UnifiedCare API (WSO2)      │──────────────────────────► Epic EMR
Postman ───────────────►│  /unifiedcare on :9095       │   
                        │                              │
                        │  epic:FHIRClientConnector    │   SMART Backend Auth + FHIR
                        │  cerner:FHIRClientConnector  │──────────────────────────► Cerner EMR
                        └──────────────────────────────┘   (system/*.read scopes)
```

## Authentication (system-to-system, no auth-code grant)

| EMR | Mechanism | Connector config |
|---|---|---|
| Epic | SMART Backend Services: RS384 private-key JWT client assertion at the token endpoint | `auth:PKJWTAuthConfig` (client id + key file) |
| Cerner | OAuth2 client credentials with `system/*` scopes | `http:OAuth2ClientCredentialsGrantConfig` |

Token acquisition, caching and refresh are handled inside the Ballerina FHIR connectors
(`ballerinax/health.clients.fhir.epic`, `ballerinax/health.clients.fhir.cerner`).

## Project layout

| File | Purpose |
|---|---|
| `clients.bal` | Epic + Cerner connector initialization and configurables |
| `service.bal` | REST service, Patient-360 parallel aggregation, referral matching |
| `mapping.bal` | FHIR R4 → summary-record mapping (via `health.fhir.r4.parser` / `international401`) |
| `types.bal` | API data model (PatientSummary, Patient360, ReferralPacket, ...) |
| `config.toml.sample` | Configuration template — copy to `Config.toml` (gitignored) and add credentials |
| `UnifiedCare.postman_collection.json` | Demo Postman collection |

## Setup & run

1. Ballerina 2201.13.x (Swan Lake). Dependencies resolve from Ballerina Central on first build.
2. Copy `config.toml.sample` to `Config.toml` and fill in your sandbox app credentials
   (Epic backend app client id, Cerner system app client id/secret).
3. Place the RSA private key registered on your Epic backend app in the project directory
   as `epic-private-key.pem` (see `epicKeyFile` in `Config.toml`). `Config.toml` and key
   files are gitignored — never commit credentials.
4. Start the service:

   ```bash
   cd use-cases/emr-unified-patient-access
   bal run
   ```

   The service listens on `http://localhost:9095/unifiedcare`.

5. Import `UnifiedCare.postman_collection.json` into Postman and run folders 1 → 4.

## REST interface

| Method & path | Description |
|---|---|
| `GET /unifiedcare/patients/{id}` | Unified lookup — id resolved against both EMRs, combined result |
| `GET /unifiedcare/patients?family=&given=&birthdate=` | Unified search — merged matches from both EMRs |
| `GET /unifiedcare/patients/{id}/summary` | Unified Patient-360 — per-EMR clinical summaries, cross-linked by demographics |
| `POST /unifiedcare/referrals` | Cross-EMR referral: source packet + target match |

`POST /unifiedcare/referrals` body:

```json
{
  "sourceEmr": "epic",
  "targetEmr": "cerner",
  "patientId": "erXuFYUfucBZaryVksYEcMg3",
  "reason": "Endocrinology follow-up at community clinic"
}
```

