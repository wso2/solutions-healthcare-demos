// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

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
