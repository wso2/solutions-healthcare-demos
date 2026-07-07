# Front Desk Dashboard

A front-desk / reception dashboard for the Care Loop stack - a nicer UI wrapper
over OpenEMR, focused on tasks and patient flow. Next.js (App Router) on Bun,
styled entirely with shadcn/ui (port 3002).

The dashboard mostly renders empty - stat cards read zero and the tables and
boards are empty - because no data source is wired in yet for patients,
doctors, or appointments. The types and data layer live in `src/lib/`,
structured so a real OpenEMR FHIR integration can drop in later (planned
separately).

The one exception is Tasks: `/api/tasks` reads FHIR `Task` resources
(status `requested`) from `ehr-fhir-server` via `fhir-kit-client`, and the
dashboard home page polls it to show active EHR tasks - this is the escalation
path fed by `care-loop-analysis-service`.

## Pages

- `/` - dashboard: task-queue centerpiece (tabs by status), today's stats,
  waiting room, today's appointments, and active EHR tasks.
- `/tasks` - Kanban board (To do / In progress / Done) with search and filters.
- `/patients` - patient directory with search, filters, and a detail sheet.
- `/appointments` - the day's schedule.

## Run

Part of the stack compose file as the `front-desk-dashboard` service:

```sh
docker compose up -d --build front-desk-dashboard
```

Then open http://localhost:3002. Standalone dev: `bun install && bun dev`.

Set `EHR_FHIR_SERVER_URL` to point `/api/tasks` at the EHR FHIR server
(defaults to `http://localhost:9090/fhir/r4`, matching the value used
elsewhere in the compose file when running standalone against a local stack).
