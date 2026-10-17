import "server-only";
import { tournamentEntry } from "@gamehub/db";
import { and, count, eq, lte } from "drizzle-orm";
import { getDb } from "./db";

/** Tournament wins (1st) and podiums (top 3) for the profile line on Home. */
export async function tournamentRecord(userId: string): Promise<{ wins: number; podiums: number }> {
  const db = getDb();
  const [wins, podiums] = await Promise.all([
    db
      .select({ n: count() })
      .from(tournamentEntry)
      .where(and(eq(tournamentEntry.userId, userId), eq(tournamentEntry.place, 1))),
    db
      .select({ n: count() })
      .from(tournamentEntry)
      .where(and(eq(tournamentEntry.userId, userId), lte(tournamentEntry.place, 3))),
  ]);
  return { wins: wins[0]?.n ?? 0, podiums: podiums[0]?.n ?? 0 };
}
