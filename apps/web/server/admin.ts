import "server-only";
import { moderationAction, report, user } from "@gamehub/db";
import { alias } from "drizzle-orm/pg-core";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "./db";
import { requirePlayer } from "./session";

/** Admin pages: role "admin" (fresh from the database), or a plain 404. */
export async function requireAdmin() {
  const me = await requirePlayer({ fresh: true });
  if ((me as { role?: string }).role !== "admin") notFound();
  return me;
}

export type QueueItem = {
  id: string;
  reporter: string | null;
  target: { id: string; username: string; bannedUntil: Date | null; chatMutedUntil: Date | null };
  roomId: string;
  reason: string;
  message: string | null;
  createdAt: Date;
  /** The target's history: reports ever, and moderation steps. */
  reports: number;
  actions: Array<{ action: string; until: Date | null; at: Date }>;
};

export async function openReports(): Promise<QueueItem[]> {
  const db = getDb();
  const reporter = alias(user, "reporter");
  const target = alias(user, "target");
  const rows = await db
    .select({
      id: report.id,
      reporter: reporter.username,
      targetId: target.id,
      targetName: target.username,
      bannedUntil: target.bannedUntil,
      chatMutedUntil: target.chatMutedUntil,
      roomId: report.roomId,
      reason: report.reason,
      message: report.message,
      createdAt: report.createdAt,
    })
    .from(report)
    .innerJoin(target, eq(target.id, report.targetId))
    .leftJoin(reporter, eq(reporter.id, report.reporterId))
    .where(eq(report.status, "open"))
    .orderBy(desc(report.createdAt))
    .limit(100);
  const ids = [...new Set(rows.map((r) => r.targetId))];
  const [counts, actions] = ids.length
    ? await Promise.all([
        db
          .select({ id: report.targetId, n: sql<number>`count(*)::int` })
          .from(report)
          .where(inArray(report.targetId, ids))
          .groupBy(report.targetId),
        db
          .select({
            id: moderationAction.targetId,
            action: moderationAction.action,
            until: moderationAction.until,
            at: moderationAction.createdAt,
          })
          .from(moderationAction)
          .where(inArray(moderationAction.targetId, ids))
          .orderBy(desc(moderationAction.createdAt)),
      ])
    : [[], []];
  return rows.map((r) => ({
    id: r.id,
    reporter: r.reporter,
    target: {
      id: r.targetId,
      username: r.targetName ?? "?",
      bannedUntil: r.bannedUntil,
      chatMutedUntil: r.chatMutedUntil,
    },
    roomId: r.roomId,
    reason: r.reason,
    message: r.message,
    createdAt: r.createdAt,
    reports: counts.find((c) => c.id === r.targetId)?.n ?? 0,
    actions: actions
      .filter((a) => a.id === r.targetId)
      .slice(0, 5)
      .map((a) => ({ action: a.action, until: a.until, at: a.at })),
  }));
}

export async function findUser(username: string) {
  const [u] = await getDb()
    .select({
      id: user.id,
      username: user.username,
      bannedUntil: user.bannedUntil,
      chatMutedUntil: user.chatMutedUntil,
    })
    .from(user)
    .where(eq(user.username, username.trim().replace(/^@/, "").toLowerCase()));
  return u?.username ? u : null;
}
