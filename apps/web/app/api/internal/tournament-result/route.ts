import {
  match,
  matchPlayer,
  tournament,
  tournamentEntry,
  tournamentStage,
  user,
} from "@gamehub/db";
import { tournamentResultSchema } from "@gamehub/protocol";
import { verifyBody } from "@gamehub/protocol/hmac";
import { inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import { env } from "@/server/env";

// A finished tournament's standings and its tables' games, from the realtime Worker
// (docs/16-tournaments.md). Signed with INTERNAL_HMAC_SECRET. Every insert skips rows that
// already exist, so a retried post fills in whatever an interrupted one missed.
const MAX_BODY = 256 * 1024;

export async function POST(req: Request) {
  const secret = env().INTERNAL_HMAC_SECRET;
  if (!secret) return Response.json({ error: "OFF" }, { status: 503 });
  const body = await req.text();
  if (body.length > MAX_BODY) return Response.json({ error: "TOO_BIG" }, { status: 413 });
  const signed = await verifyBody(
    secret,
    body,
    req.headers.get("x-gh-ts"),
    req.headers.get("x-gh-sig"),
  );
  if (!signed) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const parsed = tournamentResultSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  const r = parsed.data;
  const db = getDb();

  // Accounts deleted since the tournament: their rows keep the name, without the link.
  const ids = [
    ...new Set(
      [
        r.hostUserId,
        ...r.entries.map((e) => e.userId),
        ...r.matches.flatMap((m) => m.players.map((p) => p.userId)),
      ].filter((x): x is string => !!x),
    ),
  ];
  const known = new Set(
    ids.length
      ? (await db.select({ id: user.id }).from(user).where(inArray(user.id, ids))).map((u) => u.id)
      : [],
  );
  const who = (id: string | null) => (id && known.has(id) ? id : null);

  await db
    .insert(tournament)
    .values({
      id: r.id,
      code: r.code,
      name: r.name,
      hostId: who(r.hostUserId),
      entrants: r.entries.length,
      botFill: r.botFill,
      dataVersion: r.dataVersion,
      startedAt: new Date(r.startedAt),
      endedAt: new Date(r.endedAt),
    })
    .onConflictDoNothing();
  await db
    .insert(tournamentStage)
    .values(
      r.stages.map((s, idx) => ({
        tournamentId: r.id,
        idx,
        game: s.game,
        rules: s.rules ?? {},
        tableSize: s.tableSize,
        advancePerTable: s.advance,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(tournamentEntry)
    .values(
      r.entries.map((e) => ({
        tournamentId: r.id,
        entrant: e.entrant,
        userId: who(e.userId),
        isBot: e.isBot,
        displayName: e.displayName,
        place: e.place,
        outAtStage: e.outAtStage,
        playedByBot: e.playedByBot,
      })),
    )
    .onConflictDoNothing();
  if (r.matches.length) {
    await db
      .insert(match)
      .values(
        r.matches.map((m) => ({
          id: m.id,
          roomId: m.roomId,
          game: m.game,
          kind: "tournament" as const,
          ranked: false,
          playerCount: m.playerCount,
          rules: m.rules ?? {},
          tournamentId: r.id,
          startedAt: new Date(m.startedAt),
          endedAt: new Date(m.endedAt),
        })),
      )
      .onConflictDoNothing();
    await db
      .insert(matchPlayer)
      .values(
        r.matches.flatMap((m) =>
          m.players.map((p) => ({
            matchId: m.id,
            seat: p.seat,
            userId: who(p.userId),
            isBot: p.isBot,
            botLevel: p.botLevel,
            displayName: p.displayName,
            place: p.place,
            leftEarly: p.leftEarly,
          })),
        ),
      )
      .onConflictDoNothing();
  }
  return Response.json({ ok: true });
}
