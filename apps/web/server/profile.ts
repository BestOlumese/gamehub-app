import "server-only";
import {
  footballSoloRun,
  match,
  matchPlayer,
  rating,
  tournamentEntry,
  user,
  userStats,
} from "@gamehub/db";
import { displayRating, PLACEMENT_GAMES } from "@gamehub/engine/matchmaking";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "./db";
import { boardTag, profileTag } from "./results";

export type GameCard = {
  game: string;
  variant: string;
  played: number;
  won: number;
  currentStreak: number;
  bestStreak: number;
  /** Ranked games in this pool, and the rating once placed. */
  ranked: number;
  rating: number | null;
};

export type RecentMatch = {
  id: string;
  game: string;
  kind: string;
  variant: string;
  timeControl: string | null;
  players: number;
  place: number;
  shared: boolean;
  ratingBefore: number | null;
  ratingAfter: number | null;
  endedAt: Date;
};

export type Profile = {
  id: string;
  username: string;
  image: string | null;
  since: Date;
  wins: number;
  podiums: number;
  /** Football solo runs: the best (most wins) and how many. */
  solo: { best: number; runs: number } | null;
  cards: GameCard[];
  recent: RecentMatch[];
};

/** A player's public page: stats per game, ratings, last 20 matches, tournaments. */
export async function profileOf(username: string): Promise<Profile | null> {
  "use cache";
  cacheLife("minutes");
  const db = getDb();
  const [u] = await db
    .select({ id: user.id, username: user.username, image: user.image, since: user.createdAt })
    .from(user)
    .where(eq(user.username, username.toLowerCase()));
  if (!u?.username) return null;
  cacheTag(profileTag(u.id));
  const [stats, ratings, recentRows, wins, podiums, runs] = await Promise.all([
    db.select().from(userStats).where(eq(userStats.userId, u.id)),
    db.select().from(rating).where(eq(rating.userId, u.id)),
    db
      .select({
        id: match.id,
        game: match.game,
        kind: match.kind,
        variant: match.variant,
        timeControl: match.timeControl,
        players: match.playerCount,
        place: matchPlayer.place,
        ratingBefore: matchPlayer.ratingBefore,
        ratingAfter: matchPlayer.ratingAfter,
        endedAt: match.endedAt,
        shared: sql<boolean>`(select count(*) from match_player o where o.match_id = ${match.id} and o.place = ${matchPlayer.place}) > 1`,
      })
      .from(matchPlayer)
      .innerJoin(match, eq(match.id, matchPlayer.matchId))
      .where(eq(matchPlayer.userId, u.id))
      .orderBy(desc(match.endedAt))
      .limit(20),
    db
      .select({ n: count() })
      .from(tournamentEntry)
      .where(and(eq(tournamentEntry.userId, u.id), eq(tournamentEntry.place, 1))),
    db
      .select({ n: count() })
      .from(tournamentEntry)
      .where(and(eq(tournamentEntry.userId, u.id), lte(tournamentEntry.place, 3))),
    db
      .select({
        best: sql<number>`coalesce(max(${footballSoloRun.wins}), 0)::int`,
        runs: sql<number>`count(*)::int`,
      })
      .from(footballSoloRun)
      .where(eq(footballSoloRun.userId, u.id)),
  ]);
  const cards: GameCard[] = stats
    .map((st) => {
      const r = ratings.find((x) => x.game === st.game && x.variant === st.variant);
      return {
        game: st.game,
        variant: st.variant,
        played: st.played,
        won: st.won,
        currentStreak: st.currentStreak,
        bestStreak: st.bestStreak,
        ranked: r?.played ?? 0,
        rating: r && r.played >= PLACEMENT_GAMES ? displayRating(r) : null,
      };
    })
    .sort((a, b) => b.played - a.played);
  return {
    id: u.id,
    username: u.username,
    image: u.image,
    since: u.since,
    wins: wins[0]?.n ?? 0,
    podiums: podiums[0]?.n ?? 0,
    solo: runs[0]?.runs ? { best: runs[0].best, runs: runs[0].runs } : null,
    cards,
    recent: recentRows.map((m) => ({ ...m, shared: !!m.shared })),
  };
}

export type BoardRow = {
  userId: string;
  username: string;
  image: string | null;
  /** All time: the rating (or placement games so far); weekly: rating gained. */
  value: number;
  played: number;
  placed: boolean;
};

/** Monday 00:00 in Lagos (UTC+1, no daylight saving), as a Date. */
export function weekStart(now = Date.now()): Date {
  const lagos = new Date(now + 60 * 60_000);
  const day = (lagos.getUTCDay() + 6) % 7; // Monday 0
  const monday = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate() - day);
  return new Date(monday - 60 * 60_000);
}

/**
 * The top 100 in a pool. All time: placed players by rating, then people still in their
 * placement games. Weekly: rating gained since Monday (Lagos), at least 5 ranked games.
 */
export async function boardOf(
  game: string,
  variant: string,
  period: "all" | "week",
): Promise<BoardRow[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(boardTag(game, variant));
  const db = getDb();
  if (period === "all") {
    const rows = await db
      .select({
        userId: rating.userId,
        username: user.username,
        image: user.image,
        mu: rating.mu,
        sigma: rating.sigma,
        played: rating.played,
      })
      .from(rating)
      .innerJoin(user, eq(user.id, rating.userId))
      .where(and(eq(rating.game, game as never), eq(rating.variant, variant)))
      .orderBy(desc(sql`${rating.played} >= ${PLACEMENT_GAMES}`), desc(rating.ordinal))
      .limit(100);
    return rows.map((r) => ({
      userId: r.userId,
      username: r.username ?? "?",
      image: r.image,
      value: displayRating(r),
      played: r.played,
      placed: r.played >= PLACEMENT_GAMES,
    }));
  }
  const gain = sql<number>`sum(${matchPlayer.ratingAfter} - ${matchPlayer.ratingBefore})::int`;
  const games = sql<number>`count(*)::int`;
  const rows = await db
    .select({ userId: matchPlayer.userId, username: user.username, image: user.image, gain, games })
    .from(matchPlayer)
    .innerJoin(match, eq(match.id, matchPlayer.matchId))
    .innerJoin(user, eq(user.id, matchPlayer.userId))
    .where(
      and(
        eq(match.ranked, true),
        eq(match.game, game as never),
        eq(match.variant, variant),
        gte(match.endedAt, weekStart()),
      ),
    )
    .groupBy(matchPlayer.userId, user.username, user.image)
    .having(sql`count(*) >= 5`)
    .orderBy(desc(gain))
    .limit(100);
  return rows.map((r) => ({
    userId: r.userId ?? "",
    username: r.username ?? "?",
    image: r.image,
    value: r.gain,
    played: r.games,
    placed: true,
  }));
}
