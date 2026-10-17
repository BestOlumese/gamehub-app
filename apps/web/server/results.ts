import "server-only";
import { footballSoloRun, match, matchPlayer, rating, user, userStats } from "@gamehub/db";
import { displayRating, PAIR_CAP } from "@gamehub/engine/matchmaking";
import type { MatchResult } from "@gamehub/protocol";
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { revalidateTag } from "next/cache";
import { rate, rating as fresh } from "openskill";
import { getDb } from "./db";

export const boardTag = (game: string, variant: string) => `lb:${game}:${variant}`;
export const profileTag = (userId: string) => `profile:${userId}`;

/**
 * Stores one finished game (docs/08-matchmaking-ratings.md): the match and its players, everyone's
 * stats, and, for a ranked game, new openskill ratings for the people in it (bots and people who
 * left don't move anyone's rating but are placed as they finished). Idempotent: a repeat is a no-op.
 */
export async function ingestMatch(r: MatchResult): Promise<{ stored: boolean; ranked: boolean }> {
  const db = getDb();
  const ids = [...new Set(r.players.flatMap((p) => (p.userId ? [p.userId] : [])))];
  const known = new Set(
    ids.length
      ? (await db.select({ id: user.id }).from(user).where(inArray(user.id, ids))).map((u) => u.id)
      : [],
  );
  const players = r.players.map((p) => ({
    ...p,
    userId: p.userId && known.has(p.userId) ? p.userId : null,
  }));
  const people = players.filter((p): p is typeof p & { userId: string } => !!p.userId);

  // Ranked needs two people; and the same pair can't farm each other.
  const ranked =
    r.ranked &&
    people.length >= 2 &&
    (await underPairCap(
      r,
      people.map((p) => p.userId),
    ));

  const inserted = await db
    .insert(match)
    .values({
      id: r.id,
      roomId: r.roomId,
      game: r.game,
      kind: r.kind,
      ranked,
      playerCount: r.playerCount,
      rules: r.rules ?? {},
      variant: r.variant,
      timeControl: r.timeControl,
      startedAt: new Date(r.startedAt),
      endedAt: new Date(r.endedAt),
    })
    .onConflictDoNothing()
    .returning({ id: match.id });
  if (!inserted.length) return { stored: false, ranked: false };

  // Ratings first (their before/after go on the player rows).
  const change = new Map<string, { before: number; after: number }>();
  if (ranked) {
    const rows = await db
      .select()
      .from(rating)
      .where(
        and(
          eq(rating.game, r.game),
          eq(rating.variant, r.variant),
          inArray(
            rating.userId,
            people.map((p) => p.userId),
          ),
        ),
      );
    const before = people.map((p) => {
      const row = rows.find((x) => x.userId === p.userId);
      return row ? { mu: row.mu, sigma: row.sigma } : fresh();
    });
    // Each person a team of one; rank = place (ties share it).
    const after = rate(
      before.map((b) => [b]),
      { rank: people.map((p) => p.place) },
    );
    const winners = people.filter((p) => p.place === 1).length;
    for (const [k, p] of people.entries()) {
      const a = after[k]?.[0];
      const b = before[k];
      if (!a || !b) continue;
      const won = p.place === 1 && winners === 1 ? 1 : 0;
      change.set(p.userId, { before: displayRating(b), after: displayRating(a) });
      await db
        .insert(rating)
        .values({
          userId: p.userId,
          game: r.game,
          variant: r.variant,
          mu: a.mu,
          sigma: a.sigma,
          ordinal: a.mu - 3 * a.sigma,
          display: displayRating(a),
          played: 1,
          won,
        })
        .onConflictDoUpdate({
          target: [rating.userId, rating.game, rating.variant],
          set: {
            mu: a.mu,
            sigma: a.sigma,
            ordinal: a.mu - 3 * a.sigma,
            display: displayRating(a),
            played: sql`${rating.played} + 1`,
            won: sql`${rating.won} + ${won}`,
            updatedAt: new Date(),
          },
        });
    }
  }

  await db
    .insert(matchPlayer)
    .values(
      players.map((p) => ({
        matchId: r.id,
        seat: p.seat,
        userId: p.userId,
        isBot: p.isBot,
        botLevel: p.botLevel,
        displayName: p.displayName,
        place: p.place,
        leftEarly: p.leftEarly,
        ratingBefore: p.userId ? (change.get(p.userId)?.before ?? null) : null,
        ratingAfter: p.userId ? (change.get(p.userId)?.after ?? null) : null,
      })),
    )
    .onConflictDoNothing();

  // A football solo run: its record (the profile shows the best run).
  const runner = people[0];
  if (r.solo && runner)
    await db
      .insert(footballSoloRun)
      .values({
        id: r.id,
        userId: runner.userId,
        wins: r.solo.wins,
        played: r.solo.played,
        teamRating: r.solo.teamRating,
        luck: r.solo.luck,
        dataVersion: r.solo.dataVersion,
        finishedAt: new Date(r.endedAt),
      })
      .onConflictDoNothing();

  await addStats(r.game, r.variant, people, players.filter((p) => p.place === 1).length);

  if (ranked) revalidateTag(boardTag(r.game, r.variant), { expire: 0 });
  for (const p of people) revalidateTag(profileTag(p.userId), { expire: 0 });
  return { stored: true, ranked };
}

/** The same two people may meet in ranked at most PAIR_CAP times in 24 h per game. */
async function underPairCap(r: MatchResult, userIds: string[]): Promise<boolean> {
  const db = getDb();
  const a = alias(matchPlayer, "a");
  const b = alias(matchPlayer, "b");
  const since = new Date(r.endedAt - 24 * 60 * 60_000);
  for (let i = 0; i < userIds.length; i++)
    for (let j = i + 1; j < userIds.length; j++) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(a)
        .innerJoin(b, eq(a.matchId, b.matchId))
        .innerJoin(match, eq(match.id, a.matchId))
        .where(
          and(
            eq(a.userId, userIds[i] as string),
            eq(b.userId, userIds[j] as string),
            eq(match.game, r.game),
            eq(match.ranked, true),
            gt(match.endedAt, since),
            ne(match.id, r.id),
          ),
        );
      if ((row?.n ?? 0) >= PAIR_CAP) return false;
    }
  return true;
}

/** Stats for the people in a game (ranked or not): played, won (a shared first isn't a win), streaks. */
export async function addStats(
  game: MatchResult["game"],
  variant: string,
  players: ReadonlyArray<{ userId: string; place: number }>,
  /** How many shared first place, bots included. */
  firsts: number,
) {
  const db = getDb();
  for (const p of players) {
    const won = p.place === 1 && firsts === 1 ? 1 : 0;
    await db
      .insert(userStats)
      .values({
        userId: p.userId,
        game,
        variant,
        played: 1,
        won,
        currentStreak: won,
        bestStreak: won,
      })
      .onConflictDoUpdate({
        target: [userStats.userId, userStats.game, userStats.variant],
        set: {
          played: sql`${userStats.played} + 1`,
          won: sql`${userStats.won} + ${won}`,
          currentStreak: won ? sql`${userStats.currentStreak} + 1` : 0,
          bestStreak: won
            ? sql`greatest(${userStats.bestStreak}, ${userStats.currentStreak} + 1)`
            : sql`${userStats.bestStreak}`,
        },
      });
  }
}
