# care-loop-analysis-service

Standalone Ballerina risk-scoring bridge (port 8005) between care-loop-collector-service, care-loop-heart-risk-service, care-loop-ai-service, care-loop-fhir-server, and ehr-fhir-server. It scores incoming vitals against the ML model and, on escalation, combines that with the agentic assessment to decide whether to raise a Task.

care-loop-fhir-server (internal) is used for everything except the escalation `Task`, which is the only resource written to ehr-fhir-server (external EHR/EMR).

## Endpoints

- `POST /vitals-ready {patientId}` — acks immediately, then works in the background:
  - fetches the `Patient`, derives age from `Patient.birthDate` and sex from `Patient.gender`;
  - computes max_hr from the last hour of vitals Observations in care-loop-fhir-server;
  - prefills the remaining clinical features from the patient's FHIR record;
  - scores the full nine-feature set against care-loop-heart-risk-service's CatBoost model at `POST /predict` (reject-incomplete: any missing feature is a 422).

  Below `mlEscalationThreshold` it saves a FHIR `RiskAssessment` and stops. At or above it, it records a pending case, asks care-loop-collector-service to start the emergency questionnaire via `POST /patients/{patientId}/generate`, and starts a `questionnaireTimeoutHours` fail-safe watcher.

- `POST /emergency-answers {patientId, answers}` — the callback care-loop-collector-service hits once the emergency questionnaire is answered. It clears the pending case's timeout watcher, asks care-loop-ai-service's `POST /risk-assessment` for its own probability/risk from the questionnaire answers, and always saves a combined FHIR `RiskAssessment` citing both probabilities. Only if both the ML and agentic probabilities independently clear their own thresholds does it create a FHIR `Task` on ehr-fhir-server. If the questionnaire times out with no answer, the same fail-safe `Task` creation happens on the ML probability alone.

## Config

Copy `Config.toml.example` to `Config.toml` (gitignored). docker-compose mounts `Config.toml` into the container, so this file must exist before `make up` / `docker compose up` will start this service. The example values already point at the compose service names; switch them to `localhost` when running with `bal run` on the host.

## Run locally

```sh
bal run
```

## Run with Docker

From the `hl7-ai-competition` root (docker stack):

```sh
make up        # build and start care-loop-analysis-service on :8005
make ps        # show status
make down      # stop it
```
