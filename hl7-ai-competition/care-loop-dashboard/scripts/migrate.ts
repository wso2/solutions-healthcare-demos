import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

// Runs once before build/start, kept outside the Next.js app so schema migration never races the several worker processes that import src/lib/db.ts concurrently.
const dbPath = process.env.REQUEST_LOG_DB_PATH ?? "./data/request-log.sqlite";
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA busy_timeout = 15000;");

const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
sqlite.close();

console.log(`care-loop-dashboard: migrations applied to ${dbPath}`);
