import "server-only";
import { moderationAction, report, user } from "@gamehub/db";
import type { ReportRequest } from "@gamehub/protocol";
import { signBody } from "@gamehub/protocol/hmac";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "./db";
import { realtimeEnv } from "./env";

/** Three people reporting someone within a day mutes their chat for a day (docs/09). */
const AUTO_REPORTERS = 3;
const DAY_MS = 24 * 60 * 60_000;

export const DURATIONS = {
  "1h": 60 * 60_000,
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "1d": DAY_MS,
  forever: 100 * 365 * DAY_MS,
} as const;
export type Duration = keyof typeof DURATIONS;

const id = () => crypto.randomUUID();

/** A player's report (from a room or tournament, already verified there). */
export async function recordReport(r: ReportRequest): Promise<{ autoMuted: boolean }> {
  const db = getDb();
  const [target] = await db
    .select({ id: user.id, chatMutedUntil: user.chatMutedUntil })
    .from(user)
    .where(eq(user.id, r.targetId));
  if (!target) return { autoMuted: false };
  const [reporter] = await db.select({ id: user.id }).from(user).where(eq(user.id, r.reporterId));
  await db.insert(report).values({
    id: id(),
    reporterId: reporter?.id ?? null,
    targetId: r.targetId,
    roomId: r.roomId,
    reason: r.reason,
    message: r.message,
  });
  const since = new Date(Date.now() - DAY_MS);
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${report.reporterId})::int` })
    .from(report)
    .where(
      and(eq(report.targetId, r.targetId), eq(report.status, "open"), gt(report.createdAt, since)),
    );
  if ((row?.n ?? 0) < AUTO_REPORTERS) return { autoMuted: false };
  const until = new Date(Date.now() + DAY_MS);
  if (target.chatMutedUntil && target.chatMutedUntil >= until) return { autoMuted: false };
  await db.update(user).set({ chatMutedUntil: until }).where(eq(user.id, r.targetId));
  await db.insert(moderationAction).values({
    id: id(),
    adminId: null,
    targetId: r.targetId,
    action: "chat_mute",
    until,
    note: `Automatic: ${AUTO_REPORTERS} people reported them within a day`,
  });
  return { autoMuted: true };
}

/** Closes a banned person's sockets everywhere (the Worker's presence knows where they are). */
export async function kick(userId: string): Promise<void> {
  const rt = realtimeEnv();
  const body = JSON.stringify({ userId });
  const { ts, sig } = await signBody(rt.hmacSecret, body);
  await fetch(`${rt.url}/moderation/kick`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "x-gh-ts": ts, "x-gh-sig": sig },
    cache: "no-store",
  }).catch(() => null);
}

export type ModAction =
  | { action: "dismiss"; reportId: string }
  | { action: "warn"; targetId: string; note: string; reportId?: string }
  | { action: "chat_mute"; targetId: string; duration: "1h" | "24h" | "7d"; reportId?: string }
  | { action: "ban"; targetId: string; duration: "1d" | "7d" | "forever"; reportId?: string }
  | { action: "unban"; targetId: string }
  | { action: "unmute"; targetId: string };

/** A moderator's decision, logged; the report (if any) is closed. */
export async function moderate(adminId: string, a: ModAction): Promise<void> {
  const db = getDb();
  const close = async (reportId: string | undefined, status: "actioned" | "dismissed") => {
    if (reportId) await db.update(report).set({ status }).where(eq(report.id, reportId));
  };
  if (a.action === "dismiss") {
    const [r] = await db
      .select({ targetId: report.targetId })
      .from(report)
      .where(eq(report.id, a.reportId));
    if (!r) return;
    await close(a.reportId, "dismissed");
    await db
      .insert(moderationAction)
      .values({ id: id(), adminId, targetId: r.targetId, action: "dismiss" });
    return;
  }
  const now = Date.now();
  const until =
    a.action === "chat_mute" || a.action === "ban" ? new Date(now + DURATIONS[a.duration]) : null;
  if (a.action === "warn")
    await db.update(user).set({ notice: a.note }).where(eq(user.id, a.targetId));
  if (a.action === "chat_mute")
    await db.update(user).set({ chatMutedUntil: until }).where(eq(user.id, a.targetId));
  if (a.action === "unmute")
    await db.update(user).set({ chatMutedUntil: null }).where(eq(user.id, a.targetId));
  if (a.action === "ban")
    await db.update(user).set({ bannedUntil: until }).where(eq(user.id, a.targetId));
  if (a.action === "unban")
    await db.update(user).set({ bannedUntil: null }).where(eq(user.id, a.targetId));
  await db.insert(moderationAction).values({
    id: id(),
    adminId,
    targetId: a.targetId,
    action: a.action,
    until,
    note: a.action === "warn" ? a.note : null,
  });
  if ("reportId" in a) await close(a.reportId, "actioned");
  // Every open report about them is settled by a ban.
  if (a.action === "ban") {
    await db
      .update(report)
      .set({ status: "actioned" })
      .where(and(eq(report.targetId, a.targetId), eq(report.status, "open")));
    await kick(a.targetId);
  }
}

/** A moderator's warning still waiting for "Got it", if any. */
export async function noticeFor(userId: string): Promise<string | null> {
  const [row] = await getDb().select({ notice: user.notice }).from(user).where(eq(user.id, userId));
  return row?.notice ?? null;
}
