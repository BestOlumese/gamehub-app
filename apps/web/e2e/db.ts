import { createDb, session, user } from "@gamehub/db";
import { eq, sql } from "drizzle-orm";

// Same database the app under test uses (CI sets DATABASE_URL; locally, Docker).
const db = createDb(
  process.env.DATABASE_URL ?? "postgres://gamehub:gamehub@localhost:5433/gamehub",
);

/** Pretend the user signed in `minutes` ago. */
export async function ageSessions(email: string, minutes: number) {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!u) throw new Error(`no user ${email}`);
  await db
    .update(session)
    .set({ createdAt: sql`now() - make_interval(mins => ${minutes})` })
    .where(eq(session.userId, u.id));
}

/** A finished tournament's stored places, by its code (null until web has the result). */
export async function tournamentPlaces(code: string) {
  const rows = await db.execute(
    sql`select e.place, e.is_bot as "isBot", e.user_id as "userId", e.played_by_bot as "playedByBot"
        from tournament_entry e join tournament t on t.id = e.tournament_id where t.code = ${code}`,
  );
  return rows as unknown as Array<{
    place: number;
    isBot: boolean;
    userId: string | null;
    playedByBot: boolean;
  }>;
}

/** Matches stored for a tournament (one per table game). */
export async function tournamentMatches(code: string) {
  const rows = await db.execute(
    sql`select m.id from match m join tournament t on t.id = m.tournament_id where t.code = ${code}`,
  );
  return (rows as unknown as unknown[]).length;
}
