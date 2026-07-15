import ky from "ky";

import { logger } from "@/lib/logger";

const DASHBOARD_EVENTS_URL =
  process.env.DASHBOARD_EVENTS_URL ?? "http://localhost:3003";

// The only live-feed labels this app fires; values must stay byte-identical to care-loop-common/dashboard_events.bal's DashboardEventLabel enum and care-loop-dashboard/src/lib/stages.ts.
type DashboardEventLabel =
  | "Sent via WhatsApp"
  | "Patient responded via WhatsApp";

interface DashboardEvent {
  patientId: string;
  label: DashboardEventLabel;
  detail?: string;
  payload?: Record<string, string>;
}

// Fire-and-forget: the dashboard feed is best-effort and must never block or fail a real request in this app.
export function notifyDashboard(event: DashboardEvent): void {
  ky.post(`${DASHBOARD_EVENTS_URL}/api/events`, {
    json: event,
    timeout: 3_000,
    retry: 0,
  }).catch((error) => {
    logger.warn("dashboard event delivery failed", { event, error });
  });
}
