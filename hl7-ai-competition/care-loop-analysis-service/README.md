# care-loop-analysis-service

Standalone Ballerina risk-scoring bridge between care-loop-collector-service,
care-loop-heart-risk-service, care-loop-ai-service, care-loop-fhir-server, and
ehr-fhir-server (port 8005).

- `POST /vitals-ready {patientId}` - acks immediately, then in the background:
  fetches the `Patient`, derives age/sex, pulls the last hour of vitals
  Observations from care-loop-fhir-server, computes `max_hr`, and scores
  `{age, max_hr, sex}` against care-loop-heart-risk-service's `POST /predict`.
  Below `mlEscalationThreshold` it saves a FHIR `RiskAssessment` and stops.
  At/above it, it records a pending case, asks care-loop-collector-service to
  start the emergency questionnaire via `POST /patients/{patientId}/generate`,
  and starts a `questionnaireTimeoutHours` fail-safe watcher.
- `POST /emergency-answers {patientId, answers}` - the callback
  care-loop-collector-service hits once the emergency questionnaire is
  answered. Clears the pending case's timeout watcher, asks
  care-loop-ai-service's `POST /risk-assessment` for its own probability/risk
  from the questionnaire answers, always saves a combined FHIR
  `RiskAssessment` citing both probabilities, and - only if both the ML and
  agentic probabilities independently clear their own thresholds - creates a
  FHIR `Task` on ehr-fhir-server. If the questionnaire times out with no
  answer, the same fail-safe `Task` creation happens on the ML probability
  alone.

care-loop-fhir-server (internal) is used for everything except the escalation
`Task`, which is the only resource written to ehr-fhir-server (external
EHR/EMR).

## Config

Copy `Config.toml.example` to `Config.toml` (gitignored). docker-compose
mounts `Config.toml` into the container, so this file must exist before
`make up`/`docker compose up` will start this service. The example values
point at `localhost`; switch to the compose service names if running inside
the docker stack.

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
