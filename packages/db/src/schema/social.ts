import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// Friends (docs/07-database.md, Phase 14). A friendship is stored once per pair (userA < userB).

export const friendship = pgTable(
  "friendship",
  {
    userA: text("user_a")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userB: text("user_b")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userA, t.userB] }), index("friend_b_idx").on(t.userB)],
);

export const friendRequest = pgTable(
  "friend_request",
  {
    fromId: text("from_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toId: text("to_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId] }), index("fr_to_idx").on(t.toId)],
);

/** Blocking ends a friendship and stops requests and invites both ways. */
export const block = pgTable(
  "block",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index("block_blocked_idx").on(t.blockedId),
  ],
);

/** Players' reports (docs/09-chat-moderation.md); `message` only when its signature checked out. */
export const report = pgTable(
  "report",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    targetId: text("target_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: text("room_id").notNull(),
    reason: text("reason", {
      enum: ["abuse", "hate", "sexual", "spam", "cheating", "other"],
    }).notNull(),
    message: text("message"),
    status: text("status", { enum: ["open", "actioned", "dismissed"] })
      .notNull()
      .default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("report_status_idx").on(t.status, t.createdAt),
    index("report_target_idx").on(t.targetId),
  ],
);

/** Every moderation step; `adminId` null for automatic ones (three reporters in a day). */
export const moderationAction = pgTable(
  "moderation_action",
  {
    id: text("id").primaryKey(),
    adminId: text("admin_id").references(() => user.id, { onDelete: "set null" }),
    targetId: text("target_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text("action", {
      enum: ["dismiss", "warn", "chat_mute", "ban", "unban", "unmute"],
    }).notNull(),
    until: timestamp("until", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("modact_target_idx").on(t.targetId, t.createdAt)],
);
