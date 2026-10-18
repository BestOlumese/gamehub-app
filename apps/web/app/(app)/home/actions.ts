"use server";

import { user as userTable } from "@gamehub/db";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { requirePlayer } from "@/server/session";

/** "Got it" on a moderator's warning. */
export async function dismissNotice() {
  const user = await requirePlayer();
  await getDb().update(userTable).set({ notice: null }).where(eq(userTable.id, user.id));
}
