# WSO2 Care Loop

An AI-assisted care loop connecting remote patients with a heart clinic, built
for the HL7 AI competition. Patient-side home monitoring and messaging feed an
agent-driven engine that converts incoming data to FHIR, predicts risk, and
routes clinical notifications and telehealth back to the care team. Integrations
run on Ballerina.

## Architecture

![WSO2 Care Loop architecture](assets/architecture-diagram-v2.png)

Earlier stages: [v1](assets/architecture-diagram-v1.png),
[whiteboard sketch](assets/whiteboard-sketch.png).

## Components

- [apple-healthkit-simulator](apple-healthkit-simulator/) — FastAPI service that
  ingests Apple HealthKit samples for multiple patients (port 8000). Also runs
  an in-process hourly job (`src/app/vitals_forwarder.py`) that builds a FHIR
  `Observation` bundle from each patient's last-hour vitals and forwards it to
  `HEALTHKIT_VITALS_TARGET_URL`, pointed at care-loop-collector-service's
  `/vitals` (unset skips the POST and just builds the bundle). Manually
  trigger a cycle with `POST /vitals-cron/run-now`, check the last result with
  `GET /vitals-cron/status`.
- [whatsapp-simulator](whatsapp-simulator/) — Next.js chat UI that renders a
  pushed questionnaire and posts the conversation transcript to a callback URL
  (port 3000). Chat sessions are created by care-loop-collector-service and
  listed on the home page; there's no longer a button to trigger generation
  from this app.
- ehr-fhir-server — WSO2 FHIR R4 server (`wso2/fhir-server`, Go + Postgres)
  standing in for the clinic's EHR/EMR FHIR API. Port 9090 (`/fhir/r4`). Has no
  auth of its own; fine for this local demo, put a gateway/auth proxy in front
  for anything real.
- care-loop-fhir-server — HAPI FHIR server (`hapiproject/hapi`), the Care
  Loop's own internal FHIR store, port 9091 (`/fhir`). Kept in sync from
  ehr-fhir-server by fhir-sync; this is what fhir-mcp-server actually reads
  from.
- fhir-sync — Bun script (`scripts/sync/`) that mirrors every resource from
  ehr-fhir-server into care-loop-fhir-server every hour, `PUT`-ing each one
  under its original EHR id so references need no remapping.
- fhir-mcp-server — WSO2 FHIR R4 to MCP bridge (`wso2/fhir-mcp-server`) in
  front of care-loop-fhir-server, exposing the FHIR API as MCP tools on port
  8001. Reaches it through care-loop-fhir-server-readonly-proxy (nginx), which
  403s anything but GET/HEAD, so the bridge can only read.
- [care-loop-ai-service](care-loop-ai-service/) — standalone Ballerina agent
  (port 8003). `POST /questionnaires` with a `patientId` runs an `ai:Agent`
  wired to fhir-mcp-server (via `ai:McpToolKit`), which calls the MCP `search`
  tool itself to pull that patient's recent Observations, then drafts a FHIR
  `Questionnaire` (questions only, no answers) targeted at the vitals trend.
  Not wired into the rest of the loop yet — this is a standalone component
  for now. In compose it runs its LLM calls through the WSO2 Agent Manager AI
  gateway with tracing on (reaching fhir-mcp-server directly for MCP), via the
  tracked `Config.compose.toml` plus `BAL_CONFIG_VAR_*` env vars (see the WSO2
  Agent Manager section below); for a standalone run, copy `Config.toml.example`
  to a gitignored `Config.toml`.

- [care-loop-collector-service](care-loop-collector-service/) — standalone
  Ballerina bridge (port 8004). `POST /vitals` saves an incoming Observation
  bundle to care-loop-fhir-server and notifies care-loop-analysis-service on
  `/vitals-ready`. `POST /patients/{patientId}/generate` asks
  care-loop-ai-service to draft a Questionnaire for that patient, converts it
  into whatsapp-simulator's chat shape, and opens a chat session there.
  `POST /transcripts` is the callback each session posts its completed
  answers to; it builds a FHIR `QuestionnaireResponse` from them, saves it to
  care-loop-fhir-server, and, for emergency sessions, also forwards the
  flattened answers to care-loop-analysis-service on `/emergency-answers`.
  Needs a `Config.toml` (copy `Config.toml.example`); gitignored.
- [care-loop-analysis-service](care-loop-analysis-service/) — standalone
  Ballerina service (port 8005) that turns vitals and questionnaire answers
  into a risk decision. `POST /vitals-ready` pulls the patient's recent
  vitals and demographics, calls care-loop-heart-risk-service for an ML
  probability, and either escalates straight away or asks
  care-loop-collector-service to generate a follow-up questionnaire, with a
  timeout fail-safe if it's never answered. `POST /emergency-answers` runs
  the answers plus the ML probability through care-loop-ai-service's
  `/risk-assessment` agent and escalates if either signal crosses its
  threshold, writing a `RiskAssessment` and, on escalation, a `Task` to
  ehr-fhir-server. Needs a `Config.toml` (copy `Config.toml.example`);
  gitignored.

- [front-desk-dashboard](front-desk-dashboard/) — Next.js clinician-facing UI
  (port 3002). `GET /api/tasks` searches ehr-fhir-server for `Task?status=
  requested` and returns them flattened for the `EhrTasks` component, which
  polls it every 15s.

Run the stack with `make up`, or `make watch` to run it in the foreground and
rebuild on change.

### Seeding demo data

`make up` also runs `make seed`, which runs `scripts/seed/index.ts` (Bun):
loads the three demo patients in `scripts/seed/data/patients.json` (one
stable, one borderline, one at-risk) into apple-healthkit-simulator's own
REST API and into ehr-fhir-server as FHIR `Patient`/`Encounter`/`Condition`/
`AllergyIntolerance`/`MedicationRequest`/`Observation` resources, then seeds
the next 24 hours of hourly vitals (heart rate, SpO2, respiratory rate, blood
pressure) per patient into apple-healthkit-simulator only, timestamped into
the future from "now". apple-healthkit-simulator's `Patient.fhir_patient_id`
column (set via `PATCH /patients/{uuid}/fhir-link`) links the two systems'
patient records. `make seed` also restarts fhir-sync, which mirrors this data
into care-loop-fhir-server on startup and then hourly after that.

apple-healthkit-simulator's hourly job picks up each hour's worth of readings
as real time reaches them, forwarding to care-loop-collector-service's
`/vitals`.

## Logging

apple-healthkit-simulator and care-loop-heart-risk-service log via
[loguru](https://github.com/Delgan/loguru) (`from loguru import logger`) to
stdout. whatsapp-simulator logs via `consola` (`src/lib/logger.ts`).
front-desk-dashboard's `/api/tasks` route only logs failures, via a plain
`console.error`; no logger library wired in yet.

## WSO2 Agent Manager

`docker compose up` brings up WSO2 Agent Manager (AMP v0.18.0) as the `amp`
service, a docker-in-docker quick-start cluster whose state persists across
restarts. Set `OPENAI_API_KEY` in a gitignored `hl7-ai-competition/.env`; the
`amp-init` one-shot service then registers the `careloop-openai` LLM provider on
the AI gateway and publishes it to the catalog, mints a gateway API key into a
shared volume, registers the `careloop-ai-service` external agent, and generates
the otel-collector config with the agent's OpenChoreo identity so traces scope to
the agent in the console. care-loop-ai-service routes its LLM calls through
`http://amp:22893/careloop-openai` (gateway key sent as an `API-Key` header) and
reads FHIR directly from fhir-mcp-server; its spans go OTLP/gRPC to
`otel-collector`, which forwards them to AMP's otel ingest.

To use the console at http://localhost:13000 (admin/admin), add
`127.0.0.1 thunder.amp.localhost` to `/etc/hosts` (the login redirect needs it).
The Thunder (8080) and observability (9098) ports it calls are exposed by the
`amp-thunder-fwd` / `amp-obs-fwd` services.

## Pre-commit hooks

ruff (apple-healthkit-simulator), biome plus knip (whatsapp-simulator), and
`bal format` plus `bal scan` (care-loop-ai-service) run on staged files at
commit time. The config lives at `hl7-ai-competition/.pre-commit-config.yaml`;
install the hook pointing at it once, from the fork root (needs
`pre-commit`, e.g. `uv tool install pre-commit`; the whatsapp-simulator hooks
also need `bun`, care-loop-ai-service needs `bal`):

```sh
pre-commit install -c hl7-ai-competition/.pre-commit-config.yaml
```
