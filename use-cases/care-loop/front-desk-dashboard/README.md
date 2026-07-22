# Front Desk Dashboard

A front-desk / reception dashboard for the Care Loop stack: a UI over the EHR
FHIR server (`ehr-fhir-server`, a `wso2/fhir-server` instance), focused on the
tasks the Care Loop raises and the patients they concern. Next.js (App Router)
on Bun, styled entirely with shadcn/ui, on port 3002.

A real OpenEMR integration is planned separately; nothing here talks to OpenEMR
yet.

## Data sources

The dashboard is driven by FHIR read APIs, not a bundled data layer:

- `/api/tasks` - FHIR `Task` resources (status `requested`) from
  `ehr-fhir-server` via `fhir-kit-client`; this is the escalation path fed by
  `care-loop-analysis-service`.
- `/api/patients` - FHIR `Patient` resources from the same server.
- `/api/risk-assessments/{id}` - `RiskAssessment` from the care-loop FHIR
  server.

Doctor assignment on a task is a client-side demo mock (localStorage); there is
no assignment concept in the FHIR backend.

## Pages

- `/` - dashboard: the active EHR task queue (FHIR `Task`, status `requested`),
  each row opening the full task.
- `/tasks/{id}` - task detail: description, priority, timestamps, the referenced
  patient summary, and the demo assign-doctor control.
- `/patients` - patient directory from `ehr-fhir-server`, searchable, with a
  detail page per patient.
- `/patients/{id}` - patient detail: demographics plus that patient's active
  (`requested`) tasks.

The sidebar exposes two destinations: Dashboard and Patients.

## Run

Part of the stack compose file as the `front-desk-dashboard` service:

```sh
docker compose up -d --build front-desk-dashboard
```

Then open http://localhost:3002. Standalone dev: `bun install && bun dev`.

## Config

- `EHR_FHIR_SERVER_URL` - points the Task and Patient reads at the EHR FHIR
  server (defaults to `http://localhost:9090/fhir/r4`).
- `CARE_LOOP_FHIR_SERVER_URL` - points the RiskAssessment read at the care-loop
  FHIR server (defaults to `http://localhost:9091/fhir/r4`).

Both defaults match the values used elsewhere in the compose file when running
standalone against a local stack.
