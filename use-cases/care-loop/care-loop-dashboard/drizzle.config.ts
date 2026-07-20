import process from "node:process";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.REQUEST_LOG_DB_PATH ?? "./data/request-log.sqlite",
  },
});
