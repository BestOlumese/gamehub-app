import { bigserial, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Backs the Gmail quota guard (480 per rolling 24 h). See docs/06-auth.md.
export const emailLog = pgTable(
  "email_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(),
    toHash: text("to_hash").notNull(), // sha256(lowercased email)
    status: text("status", { enum: ["sent", "failed", "skipped_quota"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_log_created_idx").on(t.createdAt)],
);
