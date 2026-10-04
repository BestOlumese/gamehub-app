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
