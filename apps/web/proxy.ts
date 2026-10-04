import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/server/auth";
import type { SessionUser } from "@/server/session";

const GUEST_ONLY = new Set(["/login", "/signup", "/forgot-password"]);

/**
 * Optimistic routing on the session cookie cache (no DB hit for 5 minutes).
 * Server actions and pages still check for themselves; this only steers.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));

  let user: SessionUser | null = null;
  try {
    user = (await getAuth().api.getSession({ headers: req.headers }))?.user ?? null;
  } catch {
    user = null; // auth misconfigured or DB down: treat as signed out rather than 500 every page
  }

  if (GUEST_ONLY.has(pathname)) return user ? to("/home") : NextResponse.next();

  if (!user) return to(`/login?next=${encodeURIComponent(pathname + search)}`);
  if (user.bannedUntil && new Date(user.bannedUntil) > new Date()) return to("/banned");

  const onboarded = Boolean(user.adultConfirmedAt && user.username);
  if (!onboarded && pathname !== "/onboarding") return to("/onboarding");
  if (onboarded && pathname === "/onboarding") return to("/home");
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/signup",
    "/forgot-password",
    "/onboarding",
    "/home/:path*",
    "/settings/:path*",
    "/r/:path*",
    "/play/:path*",
  ],
};
