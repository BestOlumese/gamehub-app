import { block, user as userTable } from "@gamehub/db";
import { roomCodeSchema, tournamentCodeSchema } from "@gamehub/protocol";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
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
  // Fresh from the database: the session cookie can be minutes old, and a ban or mute is now.
  const db = getDb();
  const [row] = await db
    .select({
      bannedUntil: userTable.bannedUntil,
      chatMutedUntil: userTable.chatMutedUntil,
      publicChat: userTable.publicChat,
    })
    .from(userTable)
    .where(eq(userTable.id, user.id));
  if (!row || (row.bannedUntil && row.bannedUntil > new Date()))
    return Response.json({ error: "BANNED" }, { status: 403, headers: noStore });
  const blocked = (
    await db
      .select({ id: block.blockedId })
      .from(block)
      .where(eq(block.blockerId, user.id))
      .limit(200)
  ).map((b) => b.id);

  const scope = new URL(req.url).searchParams.get("scope") ?? "";
  const [kind, name] = scope.split(":");
  const valid =
    (kind === "room" && roomCodeSchema.safeParse(name).success) ||
    (kind === "tournament" && tournamentCodeSchema.safeParse(name).success) ||
    (kind === "match" && name === "global") ||
    scope === "presence";
  if (!valid) return Response.json({ error: "BAD_SCOPE" }, { status: 400, headers: noStore });

  const ticket = await new SignJWT({
    name: user.username,
    avatar: user.image ?? null,
    scope: scope === "presence" ? "presence" : `${kind}:${name}`,
    blocked,
    chatMutedUntil:
      row.chatMutedUntil && row.chatMutedUntil > new Date() ? row.chatMutedUntil.getTime() : null,
    publicChat: row.publicChat,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setAudience("gamehub-realtime")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(realtimeEnv().ticketSecret));
  return Response.json({ ticket }, { headers: noStore });
}
