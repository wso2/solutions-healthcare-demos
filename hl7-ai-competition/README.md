# WSO2 Care Loop

An AI-assisted care loop connecting remote patients with a heart clinic, built for the HL7 AI competition. Patient-side home monitoring and messaging feed an agent-driven engine that converts incoming data to FHIR, predicts risk, and routes clinical notifications and telehealth back to the care team. Integrations run on Ballerina.

## Architecture

![WSO2 Care Loop architecture](assets/architecture-diagram-v2.png)

Earlier stages: [v1](assets/architecture-diagram-v1.png), [whiteboard sketch](assets/whiteboard-sketch.png).

## Quickstart

Prerequisites: Docker with Compose v2, [Bun](https://bun.sh) (the seed and sync scripts run on it), and `make`. All LLM calls route through the WSO2 Agent Manager AI gateway (there is no direct-provider mode), so you need one LLM key — an OpenAI or an Anthropic key — which `amp-init` registers with the gateway.

1. Put the LLM key in a gitignored `hl7-ai-competition/.env` so `amp-init` can register the provider and mint a gateway key:

   ```sh
   cd hl7-ai-competition
   cp .env.example .env   # then set OPENAI_API_KEY (and/or ANTHROPIC_API_KEY)
   ```

   The provider is chosen by `modelProvider` in `care-loop-ai-service/Config.compose.toml` (default `openai`); the ai-service reads the minted gateway key from the shared volume automatically. The collector and analysis services still take their own `Config.toml` (no LLM key needed):

   ```sh
   cp care-loop-collector-service/Config.toml.example care-loop-collector-service/Config.toml
   cp care-loop-analysis-service/Config.toml.example  care-loop-analysis-service/Config.toml
   ```

2. Build, start, and seed the stack:

   ```sh
   make up
   ```

   `make up` builds the images, brings up AMP (a required dependency now — the ai-service refuses to boot without a gateway key), starts every service, and seeds the three demo patients (see Seeding demo data). Because AMP is a docker-in-docker Kubernetes cluster with a 45-minute healthcheck start_period, the first `make up` is slow and memory-hungry; the ai-service and its dependents wait on AMP finishing its bootstrap.

   Other targets: `make watch` runs it in the foreground; `make down` stops it; `make clean` also drops volumes. On resource-limited Docker where parallel builds time out, use `make up-serial`.

Once it's up, the main surfaces are the patient chat (whatsapp-simulator, http://localhost:3001), the clinician task list (front-desk-dashboard, http://localhost:3002), and the internal pipeline view (care-loop-dashboard, http://localhost:3003). The two FHIR stores are at http://localhost:9090 (EHR) and http://localhost:9091 (Care Loop), both under `/fhir/r4`.

## Components

- [apple-healthkit-simulator](apple-healthkit-simulator/) — FastAPI service that ingests Apple HealthKit samples for multiple patients (port 8000). An in-process hourly job (`src/app/vitals_forwarder.py`) builds a FHIR `Observation` bundle from each patient's last-hour vitals and forwards it to `HEALTHKIT_VITALS_TARGET_URL`, pointed at care-loop-collector-service's `/vitals` (unset skips the POST and just builds the bundle). Trigger a cycle manually with `POST /vitals-cron/run-now`; check the last result with `GET /vitals-cron/status`.
- [whatsapp-simulator](whatsapp-simulator/) — Next.js chat UI that renders a pushed questionnaire and posts the conversation transcript to a callback URL (port 3001). Chat sessions are created by care-loop-collector-service and listed on the home page; there's no longer a button to trigger generation from this app. Emergency check-ins run in a **live turn-by-turn mode**: each patient message is POSTed to the collector's `/turns`, which returns the next question (or a closing message) decided per-answer. Scripted one-shot questionnaires still work unchanged.
- ehr-fhir-server — WSO2 FHIR R4 server (`wso2/fhir-server` v0.5.0, Go + Postgres) standing in for the clinic's EHR/EMR FHIR API. Port 9090 (`/fhir/r4`). Has no auth of its own; fine for this local demo, put a gateway/auth proxy in front for anything real.
- care-loop-fhir-server — WSO2 FHIR R4 server (`wso2/fhir-server` v0.5.0), the Care Loop's own internal FHIR store, port 9091 (`/fhir/r4`). Kept in sync from ehr-fhir-server by fhir-sync; this is what fhir-mcp-server actually reads from.
- fhir-sync — Bun script (`scripts/sync/`) that mirrors every resource from ehr-fhir-server into care-loop-fhir-server every hour, `PUT`-ing each one under its original EHR id so references need no remapping.
- fhir-mcp-server — WSO2 FHIR R4 to MCP bridge (`wso2/fhir-mcp-server`) in front of care-loop-fhir-server, exposing the FHIR API as MCP tools on port 8001. Reaches it through care-loop-fhir-server-readonly-proxy (nginx), which 403s anything but GET/HEAD, so the bridge can only read.
- [care-loop-knowledge-service](care-loop-knowledge-service/) — FastAPI/FastMCP RAG server (port 8006) exposing a curated HFrEF knowledge base (open-access guidelines + patient-education corpus, embedded Chroma) as MCP tools: `search_guidelines`, `search_patient_education`, `get_feature_definition`. Embeddings default to `local`. Speaks streamable-HTTP at `/mcp`, matching fhir-mcp-server so the Ballerina `ai:McpToolKit` consumes it. Build the vector store with `make ingest`.
- pubmed-mcp-server — third-party live PubMed MCP (`ghcr.io/cyanheads/pubmed-mcp-server`, host port 8007, container 3010) giving the risk agent recent-literature lookups over NCBI E-utilities.
- [care-loop-ai-service](care-loop-ai-service/) — Ballerina agent service (port 8003) using either OpenAI (`GPT-4.1` / `GPT-4.1-nano`) or Anthropic (`Claude Sonnet 4.5` / `Claude Haiku 4.5`) via `ai:McpToolKit`s for FHIR, the knowledge base, and PubMed. Endpoints:
  - `POST /questionnaires` — drafts a FHIR `Questionnaire`.
  - `POST /conversation/turn` — drives the live adaptive check-in one turn at a time, extracting feature slots from each answer and choosing the next question under a hard question budget.
  - `POST /risk-assessment` — scores risk, grounding thresholds in the knowledge base and citing guideline sections.
  - `POST /task-description` — narrates the Task.

  Both `openai` and `anthropic` route only through the AMP AI gateway — there is no direct-provider mode — via one uniform client (`AmpModelProvider`) that always sends the OpenAI chat-completions wire format with the gateway's `API-Key` header. `anthropic` reaches Claude because AMP registers `careloop-anthropic` under the OpenAI-compatible template against Anthropic's OpenAI-compatible endpoint. See the WSO2 Agent Manager section below.
- [care-loop-dashboard](care-loop-dashboard/) — Next.js internal ops view of the demo pipeline (port 3003), backed by its own Drizzle-managed database. `POST /api/events` receives fire-and-forget milestone notifications (vitals ingested, ML/agentic scoring, Task created, etc.) from the Ballerina services via `care-loop-common`'s `notifyDashboard`, and surfaces them as a live event feed alongside a per-patient history and home summary.

- [care-loop-collector-service](care-loop-collector-service/) — standalone Ballerina bridge (port 8004). Endpoints:
  - `POST /vitals` — saves an incoming Observation bundle to care-loop-fhir-server and notifies care-loop-analysis-service on `/vitals-ready`.
  - `POST /patients/{patientId}/generate` — asks care-loop-ai-service for the opening question and opens a live chat session.
  - `POST /turns` — relays each patient message to the interview agent, merges the extracted feature slots (never overwriting a FHIR-prefilled value), enforces the question budget, and finalizes on completion — persisting the `Questionnaire` + `QuestionnaireResponse` and forwarding answers plus the enriched feature set to care-loop-analysis-service.
  - `POST /patients/{id}/conversation/claim` — hands a still-pending session to the analysis timeout watcher.
  - `POST /transcripts` — the scripted-session callback.

  Needs a `Config.toml` (copy `Config.toml.example`); gitignored.
- [care-loop-analysis-service](care-loop-analysis-service/) — standalone Ballerina service (port 8005) that turns vitals and questionnaire answers into a risk decision. Endpoints:
  - `POST /vitals-ready` — pulls the patient's recent vitals and demographics, **prefills the full 11-feature set from FHIR** (labs, prior ECG/stress-test data), calls care-loop-heart-risk-service for an ML probability, and either escalates straight away or asks care-loop-collector-service to run a live check-in, with a timeout fail-safe that claims partial answers if it's never completed.
  - `POST /emergency-answers` — **re-scores /predict with the chat-enriched features** (so reassuring answers can de-escalate), runs the answers through care-loop-ai-service's `/risk-assessment`, and escalates if both signals cross threshold, writing a `RiskAssessment` and, on escalation, a `Task` to ehr-fhir-server.

  Needs a `Config.toml` (copy `Config.toml.example`); gitignored.

- [front-desk-dashboard](front-desk-dashboard/) — Next.js clinician-facing UI (port 3002). `GET /api/tasks` searches ehr-fhir-server for `Task?status=requested` and returns them flattened for the `EhrTasks` component, which polls it every 15s.

Run the stack with `make up`, or `make watch` to run it in the foreground and rebuild on change.

### Seeding demo data

`make up` also runs `make seed`, which runs `scripts/seed/index.ts` (Bun): loads the three demo patients in `scripts/seed/data/patients.json` (one stable, one borderline, one at-risk) into apple-healthkit-simulator's own REST API and into ehr-fhir-server as FHIR `Patient`/`Encounter`/`Condition`/`AllergyIntolerance`/`MedicationRequest`/`Observation` resources, then seeds the next 24 hours of hourly vitals (heart rate, SpO2, respiratory rate, blood pressure) per patient into apple-healthkit-simulator only, timestamped into the future from "now". apple-healthkit-simulator's `Patient.fhir_patient_id` column (set via `PATCH /patients/{uuid}/fhir-link`) links the two systems' patient records. `make seed` also restarts fhir-sync, which mirrors this data into care-loop-fhir-server on startup and then hourly after that.

apple-healthkit-simulator's hourly job picks up each hour's worth of readings as real time reaches them, forwarding to care-loop-collector-service's `/vitals`.

## Logging

apple-healthkit-simulator and care-loop-heart-risk-service log via [loguru](https://github.com/Delgan/loguru) (`from loguru import logger`) to stdout. whatsapp-simulator logs via `consola` (`src/lib/logger.ts`). front-desk-dashboard's `/api/tasks` route only logs failures, via a plain `console.error`; no logger library wired in yet.

## WSO2 Agent Manager

WSO2 Agent Manager (AMP v0.18.0) is a **required** part of the stack. **All care-loop-ai-service LLM traffic routes through the gateway — there is no direct-provider mode.**

`make up` brings up the `amp`, `amp-init`, `otel-collector`, `amp-thunder-fwd`, and `amp-obs-fwd` services: a docker-in-docker quick-start cluster whose state persists across restarts, with a 45-minute healthcheck start_period. AMP is heavy and slow to bootstrap, so the ai-service (and everything downstream of it) waits on it; on a memory-constrained host the gateway bootstrap can fail to converge.

**Keys in, gateway keys out.** Set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` in a gitignored `hl7-ai-competition/.env` (at least one is required). For each key present, `amp-init`:

- registers a provider (`careloop-openai` and/or `careloop-anthropic`) and deploys and publishes it to the catalog;
- mints a gateway key into the shared `amp-shared` volume (`careloop-openai-gateway.key` / `careloop-anthropic-gateway.key`).

care-loop-ai-service's `docker-entrypoint.sh` reads those gateway keys into `openAiApiKey`/`anthropicApiKey` at startup, and refuses to boot without one. `Config.compose.toml` points `openAiServiceUrl` at `http://amp:22893/careloop-openai` and `anthropicServiceUrl` at `http://amp:22893/careloop-anthropic`.

**How routing works.** Both providers use the same `AmpModelProvider` — OpenAI chat-completions wire format plus the gateway's `API-Key` header. The client picks a provider purely by `serviceUrl` (route) and model id (`gpt-*` vs `claude-*`).

- `careloop-openai` is registered against OpenAI.
- `careloop-anthropic` is registered under the same OpenAI-compatible template, but points upstream at Anthropic's OpenAI-compatible endpoint (`https://api.anthropic.com/v1`, authenticated with `Authorization: Bearer`).

So one OpenAI-shaped request reaches either model.

**Console.** The console is at http://localhost:13000 (admin/admin). Add `127.0.0.1 thunder.amp.localhost` to `/etc/hosts` first — the login redirect needs it. The Thunder (8080) and observability (9098) ports it calls are exposed by the `amp-thunder-fwd` / `amp-obs-fwd` services.

## Pre-commit hooks

ruff (apple-healthkit-simulator), biome plus knip (whatsapp-simulator), and `bal format` plus `bal scan` (care-loop-ai-service) run on staged files at commit time. The config lives at `hl7-ai-competition/.pre-commit-config.yaml`; install the hook pointing at it once, from the fork root (needs `pre-commit`, e.g. `uv tool install pre-commit`; the whatsapp-simulator hooks also need `bun`, care-loop-ai-service needs `bal`):

```sh
pre-commit install -c hl7-ai-competition/.pre-commit-config.yaml
```
