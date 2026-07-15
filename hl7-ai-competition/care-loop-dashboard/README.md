# care-loop-dashboard

Internal ops dashboard for the Care Loop. Not a clinician-facing tool like
front-desk-dashboard - this is a live, per-patient pipeline view of what the
other Care Loop services are doing (vitals in, ML scoring, questionnaire
delivery, agentic assessment, FHIR Task handoff), styled one-to-one against
the Claude Design mock the team iterated on.

Two screens:

- **Home** - KPI tiles (total patients, open tasks, escalations today, avg
  ML risk, latest event), a searchable/paginated patient table with a
  status band per patient (Escalated/Stable, derived from the worst of the
  latest ML and agentic probabilities against the real escalation
  threshold), and a pannable/zoomable system-architecture canvas.
- **Patient** - per-patient KPI tiles, the latest pipeline run as a
  serpentine node canvas (real payload chips on the connectors, hover a
  node to inspect the exact event payload), open Tasks as a paginated
  alerts table (click a row to filter the vitals/ML tabs down to that
  Task's basedOn evidence), paginated data tabs (Vitals, Questionnaires,
  ML predictions, Agent reasoning), and a patient-record section
  (demographics, conditions, medications, allergies, encounters, baseline
  observations). Every FHIR-backed row has a `{ } FHIR` button that opens
  the raw resource in a drawer.

Cmd/Ctrl+K opens a patient search palette from anywhere.

Built with Next.js 16 (App Router, TypeScript), Tailwind CSS v4, and the same
shadcn/ui component set as front-desk-dashboard, run with bun.

## What it shows

Pipeline progress does not come from polling FHIR or whatsapp-simulator.
Other backend services POST a simple event to this dashboard whenever
something happens for a patient, and the dashboard segments those events
into runs and renders them as the run canvas (`src/lib/runs.ts`,
`src/lib/stages.ts` list the real stage order - keep it in sync with the
notifyDashboard/reportDashboardEvent call sites in each service).

Everything else on screen is real FHIR data fetched from the two FHIR
servers (patients, Observations, RiskAssessments, QuestionnaireResponses,
Tasks, patient history). Nothing rendered is invented client-side: where a
FHIR field is genuinely absent the UI shows an em-dash, and if a FHIR
server is unreachable the affected views say so instead of rendering
empty-looking zeros.

Everything polls every second (the patient roster refreshes every 15s). If
a patient has no events yet, the run canvas says so plainly.

## Event ingestion contract

Other services report progress by POSTing to this dashboard directly:

```
POST /api/events
Content-Type: application/json

{
  "patientId": "string",
  "label": "string",
  "detail": "string (optional)",
  "payload": { "key": "value", "...": "..." } (optional, flat, strings only)
}
```

No auth (internal network only). The dashboard inserts the event and
responds `202 { "ok": true }` immediately - callers should treat this as
fire-and-forget and not wait on it. `patientId` and `label` must be
non-empty strings; `payload`, when present, must be a flat object of
strings - only real fields the caller already has in scope, never invented
placeholders; invalid input gets a `400`.

Events for a patient are read back via `GET /api/patients/{id}/events`
(newest first) or, segmented into pipeline runs, via
`GET /api/patients/{id}/runs`.

## Local SQLite storage

A local SQLite file (via bun's built-in `bun:sqlite`, chosen over
better-sqlite3 since this app already runs on bun and needs no native
module install step), queried through Drizzle (`src/lib/schema.ts`,
`src/lib/db.ts`), holds one table:

- `events` - the per-patient event feed described above.

It is never a cache of FHIR data. Schema changes go through
`bun run db:generate` (drizzle-kit, writes a new file under `drizzle/`);
`bun run db:migrate` applies pending migrations and runs once, before
`build`/`dev`/`start` (see `scripts/migrate.ts`) - the app itself never runs
DDL, so the several Next.js build worker processes that import `db.ts`
concurrently can't race each other creating or altering tables.

## Running

```
bun install
cp .env.example .env
bun dev
```

Runs on port 3003 by default (`bun --bun next dev`, matching front-desk-dashboard's
`bun --bun next start` pattern).

## Config

Copy `.env.example` to `.env` (gitignored):

- `CARE_LOOP_FHIR_SERVER_URL` - care-loop-fhir-server, host port `9091`
  (`localhost:9091/fhir` outside docker-compose;
  `care-loop-fhir-server-readonly-proxy` has no host port). Patient roster,
  Observations, RiskAssessments, QuestionnaireResponses.
- `EHR_FHIR_SERVER_URL` - ehr-fhir-server, host port `9090`. Tasks (the
  alerts table) and patient history (Condition, MedicationRequest,
  AllergyIntolerance, Encounter, baseline Observations).
- `REQUEST_LOG_DB_PATH` - where the local SQLite file lives (the `events`
  table; the name and default path predate the removal of the request_log
  table and are kept so existing volumes keep their event history).

## docker-compose

Wired into the main stack as `care-loop-dashboard`, port `3003:3003`, with
the two FHIR URLs above pointed at the compose service names and a
`care-loop-dashboard-data` volume for the SQLite file. Comes up with
`docker compose up -d` / `make up` alongside everything else.
