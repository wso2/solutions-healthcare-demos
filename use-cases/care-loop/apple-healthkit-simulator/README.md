# apple-healthkit-simulator

Ingests simulated Apple HealthKit data into a local SQLite store. FastAPI + SQLModel, managed with uv.

HealthKit is a permissioned, typed health-data store. This service mirrors that object model on the server side: it accepts the common HealthKit object types and persists them so downstream feature/analytics work has a stable local source.

## Object types

Each type exposes the same three routes: batch ingest (`POST`), list recent (`GET`), and fetch one by UUID (`GET /{uuid}`).

| Resource | Prefix | HealthKit type |
| --- | --- | --- |
| Quantity samples | `/quantity-samples` | `HKQuantitySample` |
| Category samples | `/category-samples` | `HKCategorySample` |
| Correlations | `/correlations` | `HKCorrelation` |
| Workouts | `/workouts` | `HKWorkout` |
| Activity summaries | `/activity-summaries` | `HKActivitySummary` |
| Characteristics | `/characteristics` | `HKCharacteristicType` |
| Clinical records | `/clinical-records` | `HKClinicalRecord` / FHIR |

Quantity and category samples may reference a `correlation_id` (e.g. blood pressure) or a `workout_id` (e.g. heart rate during a workout).

Patients are a first-class resource too (`/patients`, same three routes). `PATCH /patients/{uuid}/fhir-link` records the matching FHIR server `Patient.id` on a patient; only patients with that link set are forwarded downstream.

## Forwarding to the Care Loop

A background job (APScheduler) runs `run_cycle` every `HEALTHKIT_VITALS_FORWARD_INTERVAL_HOURS` (default 1 hour). Each cycle:

- Collects the last interval's quantity samples for the vital-sign types (heart rate, SpO2, respiratory rate, systolic and diastolic blood pressure).
- Maps them to LOINC-coded FHIR `Observation` resources.
- Posts one FHIR transaction bundle per FHIR-linked patient to `HEALTHKIT_VITALS_TARGET_URL`. In the docker stack that target is `care-loop-collector-service`'s `/vitals` endpoint. With no target set the cycle still builds the bundle but does not send it.

Manual controls:

- `GET /vitals-cron/status` returns the last cycle summary.
- `POST /vitals-cron/run-now` forwards on demand.

## Run locally

```sh
uv sync
uv run fastapi dev src/app/main.py
```

API docs at `http://127.0.0.1:8000/docs`. The SQLite file is created at `data/healthkit.db`.

## Web UI

`http://127.0.0.1:8000/` serves an Apple Health styled control page. Pick a patient, set the vital values (heart rate, SpO2, respiratory rate, systolic and diastolic blood pressure) or use a Normal / Elevated / Critical preset, then send them to the Care Loop.

- "Send to Care Loop" ingests the readings and forwards that patient's window as a FHIR Observation bundle (`POST /vitals-cron/run-now?patient_uuid=`).
- "Send for all patients" forwards every patient (`POST /vitals-cron/run-now`).

The page reports whether a `HEALTHKIT_VITALS_TARGET_URL` is configured, so with no target set it builds the bundle without sending.

## Run with Docker

From the `use-cases/care-loop` root (docker stack):

```sh
make up        # build and start the apple-healthkit-simulator on :8000
make ps        # show status
make down      # stop it
```

## Develop

From this directory (`apple-healthkit-simulator/`):

```sh
make lint      # ruff check
make format    # ruff format
make test      # pytest
```

## Notes / current gaps

- Tables are created on startup via `SQLModel.metadata.create_all`; there is no migration tooling yet.
- Read routes support `patient_id`, `since`/`until` (on types with a `start_date`), and `limit`/`offset`.
- The data layer is synchronous (per project decision).
