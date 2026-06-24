# apple-healthkit-simulator

Collector service that ingests simulated Apple HealthKit data into a local
SQLite store. FastAPI + SQLModel, managed with uv.

HealthKit is a permissioned, typed health-data store. This service mirrors that
object model on the server side: it accepts the common HealthKit object types
and persists them so downstream feature/analytics work has a stable local
source.

## Object types

Each type exposes the same three routes: batch ingest (`POST`), list recent
(`GET`), and fetch one by UUID (`GET /{uuid}`).

| Resource | Prefix | HealthKit type |
| --- | --- | --- |
| Quantity samples | `/quantity-samples` | `HKQuantitySample` |
| Category samples | `/category-samples` | `HKCategorySample` |
| Correlations | `/correlations` | `HKCorrelation` |
| Workouts | `/workouts` | `HKWorkout` |
| Activity summaries | `/activity-summaries` | `HKActivitySummary` |
| Characteristics | `/characteristics` | `HKCharacteristicType` |
| Clinical records | `/clinical-records` | `HKClinicalRecord` / FHIR |

Quantity and category samples may reference a `correlation_id` (e.g. blood
pressure) or a `workout_id` (e.g. heart rate during a workout).

## Run locally

```sh
uv sync
uv run fastapi dev src/app/main.py
```

API docs at `http://127.0.0.1:8000/docs`. The SQLite file is created at
`data/healthkit.db`.

## Run with Docker

From the repository root:

```sh
make up        # build and start the collector on :8000
make logs
make down
```

## Develop

```sh
make lint      # ruff check
make format    # ruff format
make test      # pytest
```

## Notes / current gaps

- Tables are created on startup via `SQLModel.metadata.create_all`; there is no
  migration tooling yet.
- Read routes support `limit`/`offset` only; time-window filtering is not yet
  implemented.
- The data layer is synchronous (per project decision).
