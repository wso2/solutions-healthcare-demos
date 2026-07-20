# care-loop-collector-service

Standalone Ballerina bridge (port 8004) between care-loop-ai-service, whatsapp-simulator, care-loop-analysis-service, and care-loop-fhir-server. It ingests vitals, drives questionnaire generation, and turns finished chats into FHIR records.

## Endpoints

- `POST /vitals` — apple-healthkit-simulator's vitals forwarder posts a FHIR transaction `Bundle` of `Observation`s here. Saved to care-loop-fhir-server in a single transaction, then care-loop-analysis-service is notified at `POST /vitals-ready` with the patient id. The notify is best-effort: a failed notify is logged but does not fail the call, since the vitals save already succeeded.

- `POST /patients/{patientId}/generate` — fetches that one `Patient` from care-loop-fhir-server, asks care-loop-ai-service to draft a FHIR `Questionnaire`, converts it into whatsapp-simulator's chat questionnaire shape, and creates a chat session via whatsapp-simulator's `POST /api/sessions`. Accepts an optional `emergencyContext.mlProbability`, set when care-loop-analysis-service is escalating an ML-flagged case; the session is tagged so `/transcripts` knows to forward the answers back.

- `POST /transcripts` — the callback URL handed to each whatsapp-simulator session. Once a patient finishes the chat, whatsapp-simulator POSTs the transcript here; this builds a FHIR `QuestionnaireResponse` from the answers and saves it to care-loop-fhir-server. If the session was an emergency one, it also POSTs the flattened question/answer pairs to care-loop-analysis-service's `POST /emergency-answers`.

## Config

Copy `Config.toml.example` to `Config.toml` (gitignored). docker-compose mounts `Config.toml` into the container, so this file must exist before `make up` / `docker compose up` will start this service. The example values already point at the compose service names; switch them back to `localhost` when running with `bal run` on the host.

## Run locally

```sh
bal run
```

## Run with Docker

From the `use-cases/care-loop` root (docker stack):

```sh
make up        # build and start care-loop-collector-service on :8004
make ps        # show status
make down      # stop it
```
