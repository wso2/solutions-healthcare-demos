import type { StageLabel } from "@/lib/stages";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import process from "node:process";
import { Database } from "bun:sqlite";
import { desc, eq } from "drizzle-orm";

import { drizzle } from "drizzle-orm/bun-sqlite";

import { events } from "@/lib/schema";

// Schema lives in src/lib/schema.ts; this module never runs DDL - migrations run once via scripts/migrate.ts so the several Next.js worker processes that import it concurrently can't race each other.
const dbPath = process.env.REQUEST_LOG_DB_PATH ?? "./data/request-log.sqlite";
mkdirSync(dirname(dbPath), { recursive: true });

// Next.js build/dev spins up several worker processes that all import this module and open the same file at nearly the same instant; a 15s busy_timeout alone isn't enough right after migrate.ts just created it, so retry the open itself a few times too.
function openWithRetry(path: string, attempts = 5): Database {
  for (let i = 0; i < attempts; i++) {
    try {
      const handle = new Database(path, { create: true });
      handle.exec("PRAGMA journal_mode = WAL;");
      handle.exec("PRAGMA busy_timeout = 15000;");
      return handle;
    } catch (error) {
      if (i === attempts - 1) throw error;
      Bun.sleepSync(200 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

const sqlite = openWithRetry(dbPath);
const db = drizzle(sqlite);

export interface CareLoopEvent {
  id: number;
  patientId: string;
  // Known labels get the StageLabel union; the (string & {}) arm keeps ingestion permissive - unknown labels are stored and shown, never rejected (README's fixed contract).
  label: StageLabel | (string & {});
  detail: string | null;
  payload: Record<string, string> | null;
  receivedAt: string;
}

function toCareLoopEvent(row: typeof events.$inferSelect): CareLoopEvent {
  return {
    id: row.id,
    patientId: row.patientId,
    label: row.label,
    detail: row.detail,
    payload: row.payload ? (JSON.parse(row.payload) as Record<string, string>) : null,
    receivedAt: row.receivedAt,
  };
}

export function insertEvent(
  patientId: string,
  label: string,
  detail?: string,
  payload?: Record<string, string>,
): number {
  const [row] = db
    .insert(events)
    .values({
      patientId,
      label,
      detail: detail ?? null,
      payload: payload ? JSON.stringify(payload) : null,
      receivedAt: new Date().toISOString(),
    })
    .returning({ id: events.id })
    .all();
  return row!.id;
}

export function listEvents(patientId: string, limit = 500): CareLoopEvent[] {
  const rows = db
    .select()
    .from(events)
    .where(eq(events.patientId, patientId))
    .orderBy(desc(events.receivedAt))
    .limit(limit)
    .all();
  return rows.map(toCareLoopEvent);
}

export function listRecentEvents(limit = 30): CareLoopEvent[] {
  const rows = db.select().from(events).orderBy(desc(events.receivedAt)).limit(limit).all();
  return rows.map(toCareLoopEvent);
}
