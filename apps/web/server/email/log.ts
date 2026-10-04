import "server-only";
import { createHash } from "node:crypto";
import { emailLog } from "@gamehub/db";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../db";
import type { EmailKind } from "./templates";

/** Gmail allows 500 recipients per rolling 24 h; stop before that. */
export const DAILY_EMAIL_LIMIT = 480;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_SENDS_PER_ADDRESS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export const hashEmail = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export async function emailsSentLast24h(now = new Date()) {
  const [row] = await getDb()
    .select({ n: count() })
    .from(emailLog)
    .where(
      and(eq(emailLog.status, "sent"), gte(emailLog.createdAt, new Date(now.getTime() - DAY_MS))),
    );
  return row?.n ?? 0;
}

export async function quotaReached(now = new Date()) {
  return (await emailsSentLast24h(now)) >= DAILY_EMAIL_LIMIT;
}

/** Why a send to this address should wait, or null if it may go now. */
export async function addressThrottle(
  kind: EmailKind,
  email: string,
  now = new Date(),
): Promise<"cooldown" | "daily" | null> {
  const rows = await getDb()
    .select({ createdAt: emailLog.createdAt })
    .from(emailLog)
    .where(
      and(
        eq(emailLog.toHash, hashEmail(email)),
        eq(emailLog.kind, kind),
        eq(emailLog.status, "sent"),
        gte(emailLog.createdAt, new Date(now.getTime() - DAY_MS)),
      ),
    );
  if (rows.length >= MAX_SENDS_PER_ADDRESS_PER_DAY) return "daily";
  if (rows.some((r) => now.getTime() - r.createdAt.getTime() < RESEND_COOLDOWN_MS))
    return "cooldown";
  return null;
}

export async function logEmail(
  kind: EmailKind,
  email: string,
  status: "sent" | "failed" | "skipped_quota",
) {
  await getDb()
    .insert(emailLog)
    .values({ kind, toHash: hashEmail(email), status });
}

/** Keep 30 days. Cheap enough to run on each sign-up. */
export async function pruneEmailLog(now = new Date()) {
  await getDb()
    .delete(emailLog)
    .where(lt(emailLog.createdAt, new Date(now.getTime() - 30 * DAY_MS)));
}
