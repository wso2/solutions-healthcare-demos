# WSO2 Care Loop

An AI-assisted care loop connecting remote patients with a heart clinic, built for the HL7 AI competition. Patient-side home monitoring and messaging feed an agent-driven engine that converts incoming data to FHIR, predicts risk, and routes clinical notifications and telehealth back to the care team. Integrations run on Ballerina.

## Architecture

![WSO2 Care Loop architecture](assets/architecture-diagram-v2.png)

Earlier stages: [v1](assets/architecture-diagram-v1.png), [whiteboard sketch](assets/whiteboard-sketch.png).

## Quickstart

Prerequisites: Docker with Compose v2, [Bun](https://bun.sh) (the seed and sync scripts run on it), and `make`. The agent service needs one LLM key — an Anthropic or an OpenAI key.

1. Create each Ballerina service's `Config.toml` from its example. The examples are wired for the compose network, so nothing needs editing beyond the key:

   ```sh
   cd hl7-ai-competition
   cp care-loop-ai-service/Config.toml.example       care-loop-ai-service/Config.toml
   cp care-loop-collector-service/Config.toml.example care-loop-collector-service/Config.toml
   cp care-loop-analysis-service/Config.toml.example  care-loop-analysis-service/Config.toml
   ```

2. Set the LLM key in `care-loop-ai-service/Config.toml`. The example ships with `modelProvider = "openai"`; set `openAiApiKey`, or switch `modelProvider` to `"anthropic"` and set `anthropicApiKey`. Both call the provider API directly, so `make up` doesn't wait on the AMP gateway. The knowledge base embeds locally by default, so it needs no OpenAI key; see the WSO2 Agent Manager section to route the agent through the gateway instead.

3. Build, start, and seed the stack:

   ```sh
   make up
   ```

   `make up` builds the images, starts every service, and seeds the three demo patients (see Seeding demo data). `make watch` runs it in the foreground and rebuilds on change; `make down` stops it; `make clean` also drops volumes. On resource-limited Docker where parallel builds time out, use `make up-serial`.

Once it's up, the main surfaces are the patient chat (whatsapp-simulator, http://localhost:3001), the clinician task list (front-desk-dashboard, http://localhost:3002), and the internal pipeline view (care-loop-dashboard, http://localhost:3003). The two FHIR stores are at http://localhost:9090 (EHR) and http://localhost:9091 (Care Loop), both under `/fhir/r4`.

## Components

- [apple-healthkit-simulator](apple-healthkit-simulator/) — FastAPI service that ingests Apple HealthKit samples for multiple patients (port 8000). Also runs an in-process hourly job (`src/app/vitals_forwarder.py`) that builds a FHIR `Observation` bundle from each patient's last-hour vitals and forwards it to `HEALTHKIT_VITALS_TARGET_URL`, pointed at care-loop-collector-service's `/vitals` (unset skips the POST and just builds the bundle). Manually trigger a cycle with `POST /vitals-cron/run-now`, check the last result with `GET /vitals-cron/status`.
- [whatsapp-simulator](whatsapp-simulator/) — Next.js chat UI that renders a pushed questionnaire and posts the conversation transcript to a callback URL (port 3001). Chat sessions are created by care-loop-collector-service and listed on the home page; there's no longer a button to trigger generation from this app. Emergency check-ins run in a **live turn-by-turn mode**: each patient message is POSTed to the collector's `/turns`, which returns the next question (or a closing message) decided per-answer; scripted one-shot questionnaires still work unchanged.
- ehr-fhir-server — WSO2 FHIR R4 server (`wso2/fhir-server` v0.5.0, Go + Postgres) standing in for the clinic's EHR/EMR FHIR API. Port 9090 (`/fhir/r4`). Has no auth of its own; fine for this local demo, put a gateway/auth proxy in front for anything real.
- care-loop-fhir-server — WSO2 FHIR R4 server (`wso2/fhir-server` v0.5.0), the Care Loop's own internal FHIR store, port 9091 (`/fhir/r4`). Kept in sync from ehr-fhir-server by fhir-sync; this is what fhir-mcp-server actually reads from.
- fhir-sync — Bun script (`scripts/sync/`) that mirrors every resource from ehr-fhir-server into care-loop-fhir-server every hour, `PUT`-ing each one under its original EHR id so references need no remapping.
- fhir-mcp-server — WSO2 FHIR R4 to MCP bridge (`wso2/fhir-mcp-server`) in front of care-loop-fhir-server, exposing the FHIR API as MCP tools on port 8001. Reaches it through care-loop-fhir-server-readonly-proxy (nginx), which 403s anything but GET/HEAD, so the bridge can only read.
- [care-loop-knowledge-service](care-loop-knowledge-service/) — FastAPI/FastMCP RAG server (port 8006) exposing a curated HFrEF knowledge base (open-access guidelines + patient-education corpus, embedded Chroma) as MCP tools: `search_guidelines`, `search_patient_education`, `get_feature_definition`. Embeddings default to `local`. Speaks streamable-HTTP at `/mcp`, matching fhir-mcp-server so the Ballerina `ai:McpToolKit` consumes it. Build the vector store with `make ingest`.
- pubmed-mcp-server — third-party live PubMed MCP (`ghcr.io/cyanheads/pubmed-mcp-server`, host port 8007, container 3010) giving the risk agent recent-literature lookups over NCBI E-utilities.
- [care-loop-ai-service](care-loop-ai-service/) — Ballerina agent service (port 8003) using either OpenAI (`GPT-4.1` / `GPT-4.1-nano`) or Anthropic (`Claude Sonnet 4.5` / `Claude Haiku 4.5`) via `ai:McpToolKit`s for FHIR, the knowledge base, and PubMed. Endpoints: `POST /questionnaires` drafts a FHIR `Questionnaire`; `POST /conversation/turn` drives the live adaptive check-in one turn at a time (extracting feature slots from each answer and choosing the next question under a hard question budget); `POST /risk-assessment` scores risk, grounding thresholds in the knowledge base and citing guideline sections; `POST /task-description` narrates the Task. The `openai` provider calls the OpenAI API directly by default (point `openAiServiceUrl` at the AMP gateway to route through AMP, via `AmpModelProvider`; see the WSO2 Agent Manager section below); `anthropic` always calls the Anthropic API directly; `anthropic-amp` routes Anthropic through the AMP gateway instead (`AmpAnthropicModelProvider`), since AMP has a native `anthropic` provider template alongside its OpenAI-shaped one. Needs a `Config.toml` (copy `Config.toml.example`); gitignored, never commit it.
- [care-loop-dashboard](care-loop-dashboard/) — Next.js internal ops view of the demo pipeline (port 3003), backed by its own Drizzle-managed database. `POST /api/events` receives fire-and-forget milestone notifications (vitals ingested, ML/agentic scoring, Task created, etc.) from the Ballerina services via `care-loop-common`'s `notifyDashboard`, and surfaces them as a live event feed alongside a per-patient history and home summary.

- [care-loop-collector-service](care-loop-collector-service/) — standalone Ballerina bridge (port 8004). `POST /vitals` saves an incoming Observation bundle to care-loop-fhir-server and notifies care-loop-analysis-service on `/vitals-ready`. `POST /patients/{patientId}/generate` asks care-loop-ai-service for the opening question, opens a live chat session, and drives it: `POST /turns` relays each patient message to the interview agent, merges the extracted feature slots (never overwriting a FHIR-prefilled value), enforces the question budget, and finalizes on completion — persisting the `Questionnaire` + `QuestionnaireResponse` and forwarding answers plus the enriched feature set to care-loop-analysis-service. `POST /patients/{id}/conversation/claim` hands a still-pending session to the analysis timeout watcher. `POST /transcripts` remains the scripted-session callback. Needs a `Config.toml` (copy `Config.toml.example`); gitignored.
- [care-loop-analysis-service](care-loop-analysis-service/) — standalone Ballerina service (port 8005) that turns vitals and questionnaire answers into a risk decision. `POST /vitals-ready` pulls the patient's recent vitals and demographics, **prefills the full 11-feature set from FHIR** (labs, prior ECG/stress-test data), calls care-loop-heart-risk-service for an ML probability, and either escalates straight away or asks care-loop-collector-service to run a live check-in, with a timeout fail-safe that claims partial answers if it's never completed. `POST /emergency-answers` **re-scores /predict with the chat-enriched features** (so reassuring answers can de-escalate), runs the answers through care-loop-ai-service's `/risk-assessment`, and escalates if both signals cross threshold, writing a `RiskAssessment` and, on escalation, a `Task` to ehr-fhir-server. Needs a `Config.toml` (copy `Config.toml.example`); gitignored.

- [front-desk-dashboard](front-desk-dashboard/) — Next.js clinician-facing UI (port 3002). `GET /api/tasks` searches ehr-fhir-server for `Task?status=requested` and returns them flattened for the `EhrTasks` component, which polls it every 15s.

Run the stack with `make up`, or `make watch` to run it in the foreground and rebuild on change.

### Seeding demo data

`make up` also runs `make seed`, which runs `scripts/seed/index.ts` (Bun): loads the three demo patients in `scripts/seed/data/patients.json` (one stable, one borderline, one at-risk) into apple-healthkit-simulator's own REST API and into ehr-fhir-server as FHIR `Patient`/`Encounter`/`Condition`/`AllergyIntolerance`/`MedicationRequest`/`Observation` resources, then seeds the next 24 hours of hourly vitals (heart rate, SpO2, respiratory rate, blood pressure) per patient into apple-healthkit-simulator only, timestamped into the future from "now". apple-healthkit-simulator's `Patient.fhir_patient_id` column (set via `PATCH /patients/{uuid}/fhir-link`) links the two systems' patient records. `make seed` also restarts fhir-sync, which mirrors this data into care-loop-fhir-server on startup and then hourly after that.

apple-healthkit-simulator's hourly job picks up each hour's worth of readings as real time reaches them, forwarding to care-loop-collector-service's `/vitals`.

## Logging

apple-healthkit-simulator and care-loop-heart-risk-service log via [loguru](https://github.com/Delgan/loguru) (`from loguru import logger`) to stdout. whatsapp-simulator logs via `consola` (`src/lib/logger.ts`). front-desk-dashboard's `/api/tasks` route only logs failures, via a plain `console.error`; no logger library wired in yet.

## WSO2 Agent Manager

WSO2 Agent Manager (AMP v0.18.0) is opt-in behind the `amp` compose profile: `docker compose up` and `make up` skip it; run `docker compose --profile amp up` to include the `amp`, `amp-init`, `otel-collector`, `amp-thunder-fwd`, and `amp-obs-fwd` services (a docker-in-docker quick-start cluster whose state persists across restarts, with a 45-minute healthcheck start_period). **care-loop-ai-service is not routed through it by default** — it boots directly against the configured provider (OpenAI by default) via the gitignored `Config.toml`, so `make up` doesn't depend on AMP finishing its bootstrap.

To opt in instead, set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` in a gitignored `hl7-ai-competition/.env` (at least one is required); `amp-init` registers an LLM provider per key present (`careloop-openai` and/or `careloop-anthropic`), deploys and publishes each to the catalog, and mints a gateway key per provider into the shared `amp-shared` volume (`openai-gateway.key` / `anthropic-gateway.key`). Then point care-loop-ai-service's `Config.toml` at the gateway:
- `openai`: `openAiServiceUrl = "http://amp:22893/careloop-openai"`, `openAiApiKey` = the contents of `openai-gateway.key` (see `AmpModelProvider` in `care-loop-ai-service/service.bal`).
- `anthropic-amp`: `anthropicServiceUrl = "http://amp:22893/careloop-anthropic"` (no `/v1` suffix), `anthropicApiKey` = the contents of `anthropic-gateway.key` (see `AmpAnthropicModelProvider` in `care-loop-ai-service/amp_anthropic_model_provider.bal`).

`modelProvider = "anthropic"` always calls the Anthropic API directly and never touches AMP.

To use the console at http://localhost:13000 (admin/admin), add `127.0.0.1 thunder.amp.localhost` to `/etc/hosts` (the login redirect needs it). The Thunder (8080) and observability (9098) ports it calls are exposed by the `amp-thunder-fwd` / `amp-obs-fwd` services.

## Pre-commit hooks

ruff (apple-healthkit-simulator), biome plus knip (whatsapp-simulator), and `bal format` plus `bal scan` (care-loop-ai-service) run on staged files at commit time. The config lives at `hl7-ai-competition/.pre-commit-config.yaml`; install the hook pointing at it once, from the fork root (needs `pre-commit`, e.g. `uv tool install pre-commit`; the whatsapp-simulator hooks also need `bun`, care-loop-ai-service needs `bal`):

```sh
pre-commit install -c hl7-ai-competition/.pre-commit-config.yaml
```
