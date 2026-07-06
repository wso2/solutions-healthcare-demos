# care-loop-collector-service

Standalone Ballerina bridge between care-loop-ai-service, whatsapp-simulator,
and care-loop-fhir-server (port 8004).

- `POST /generate` - fetches every `Patient` from care-loop-fhir-server, asks
  care-loop-ai-service to draft a FHIR `Questionnaire` per patient, converts
  each into whatsapp-simulator's chat questionnaire shape, and creates one
  chat session per patient via whatsapp-simulator's `POST /api/sessions`. Per
  patient failures are reported inline rather than aborting the batch.
- `POST /transcripts` - the callback URL handed to each whatsapp-simulator
  session. Once a patient finishes the chat, whatsapp-simulator POSTs the
  transcript here; this builds a FHIR `QuestionnaireResponse` from the
  answers and saves it to care-loop-fhir-server.

## Config

Copy `Config.toml.example` to `Config.toml` (gitignored). docker-compose
mounts `Config.toml` into the container, so this file must exist before
`make up`/`docker compose up` will start this service. The example values
already point at the compose service names; switch them back to `localhost`
if running with `bal run` on the host instead.

## Run locally

```sh
bal run
```

## Run with Docker

From the `hl7-ai-competition` root (docker stack):

```sh
make up        # build and start care-loop-collector-service on :8004
make ps        # show status
make down      # stop it
```
