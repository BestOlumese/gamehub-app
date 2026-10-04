import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth, type Session } from "./auth";

export type SessionUser = Session["user"];

/** Current session. `fresh` skips the 5-minute cookie cache (use after changing the user). */
export async function getSession({ fresh = false } = {}): Promise<Session | null> {
  // Read the request first: it marks the page as per-request before any secrets are touched.
  const h = await headers();
  return getAuth().api.getSession({
    headers: h,
    query: fresh ? { disableCookieCache: true } : undefined,
  });
}

export const isBanned = (u: SessionUser, now = new Date()) =>
  Boolean(u.bannedUntil && u.bannedUntil > now);
export const needsOnboarding = (u: SessionUser) => !u.adultConfirmedAt || !u.username;

/** Any signed-in user (used by onboarding). */
export async function requireUser(opts?: { fresh?: boolean }): Promise<SessionUser> {
  const session = await getSession(opts);
  if (!session) redirect("/login");
  if (isBanned(session.user)) redirect("/banned");
  return session.user;
}

/** A user who may play: adult, has a username, not banned. */
export async function requirePlayer(opts?: {
  fresh?: boolean;
}): Promise<SessionUser & { username: string }> {
  const user = await requireUser(opts);
  if (needsOnboarding(user) || !user.username) redirect("/onboarding");
  return { ...user, username: user.username };
}
