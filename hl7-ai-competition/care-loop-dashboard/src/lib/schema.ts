import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: text("patient_id").notNull(),
  label: text("label").notNull(),
  detail: text("detail"),
  payload: text("payload"),
  receivedAt: text("received_at").notNull(),
});
