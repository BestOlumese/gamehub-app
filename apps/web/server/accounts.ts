import "server-only";
import { account } from "@gamehub/db";
import { eq } from "drizzle-orm";
import { getDb } from "./db";

/** Sign-in methods linked to a user: "credential" (email + password) and/or "google". */
export async function signInMethods(userId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ p: account.providerId })
    .from(account)
    .where(eq(account.userId, userId));
  return new Set(rows.map((r) => r.p));
}
