# Front Desk Dashboard

A front-desk / reception dashboard for the Care Loop stack - a nicer UI wrapper
over OpenEMR, focused on tasks and patient flow. Next.js (App Router) on Bun,
styled entirely with shadcn/ui (port 3002).

The dashboard currently renders empty - stat cards read zero and the tables and
boards are empty - because no data source is wired in yet. The types and data
layer live in `src/lib/`, structured so a real OpenEMR FHIR integration can drop
in later (planned separately).

## Pages

- `/` - dashboard: task-queue centerpiece (tabs by status), today's stats,
  waiting room, and today's appointments.
- `/tasks` - Kanban board (To do / In progress / Done) with search and filters.
- `/patients` - patient directory with search, filters, and a detail sheet.
- `/appointments` - the day's schedule.

## Run

Part of the stack compose file as the `front-desk-dashboard` service:

```sh
docker compose up -d --build front-desk-dashboard
```

Then open http://localhost:3002. Standalone dev: `bun install && bun dev`.
