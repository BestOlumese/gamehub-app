import { roomCodeSchema } from "@gamehub/protocol";
import { SignJWT } from "jose";
import { realtimeEnv } from "@/server/env";
import { getSession, isBanned, needsOnboarding } from "@/server/session";

const noStore = { "cache-control": "no-store" };

/**
 * A 60 s ticket that lets the browser open one WebSocket to the realtime Worker
 * (which can't read our cookies). Only verified, adult, onboarded, unbanned players get one.
 */
export async function GET(req: Request) {
  const session = await getSession();
  const user = session?.user;
  if (!user || needsOnboarding(user) || !user.username) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  }
  if (isBanned(user)) return Response.json({ error: "BANNED" }, { status: 403, headers: noStore });

  const scope = new URL(req.url).searchParams.get("scope") ?? "";
  const [kind, name] = scope.split(":");
  if (kind !== "room" || !roomCodeSchema.safeParse(name).success) {
    return Response.json({ error: "BAD_SCOPE" }, { status: 400, headers: noStore });
  }

  const ticket = await new SignJWT({
    name: user.username,
    avatar: user.image ?? null,
    scope: `room:${name}`,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setAudience("gamehub-realtime")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(realtimeEnv().ticketSecret));
  return Response.json({ ticket }, { headers: noStore });
}
