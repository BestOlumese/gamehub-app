import "server-only";
import { session } from "@gamehub/db";
import { and, desc, eq, gt } from "drizzle-orm";
import { describeDevice } from "@/lib/user-agent";
import { getDb } from "./db";
import { getSession } from "./session";

export type Device = { id: string; name: string; lastActive: Date; current: boolean };

/**
 * The signed-in user's active sessions, without tokens (they never leave the server).
 * Reads the table directly: Better Auth's listSessions demands a sign-in from the
 * last `freshAge` (10 min), which would break this page for everyone else.
 */
export async function listDevices(): Promise<Device[]> {
  const current = await getSession();
  if (!current) return [];
  const rows = await getDb()
    .select({
      id: session.id,
      token: session.token,
      userAgent: session.userAgent,
      updatedAt: session.updatedAt,
    })
    .from(session)
    .where(and(eq(session.userId, current.user.id), gt(session.expiresAt, new Date())))
    .orderBy(desc(session.updatedAt));
  return rows
    .map((s) => ({
      id: s.id,
      name: describeDevice(s.userAgent),
      lastActive: s.updatedAt,
      current: s.token === current.session.token,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}
