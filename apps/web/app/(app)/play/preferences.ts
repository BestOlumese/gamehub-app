"use server";

import { user as userTable } from "@gamehub/db";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { requirePlayer } from "@/server/session";

/** In-game sound toggle. A server action keeps the auth client out of the game bundle. */
export async function setSound(on: boolean) {
  const user = await requirePlayer();
  await getDb()
    .update(userTable)
    .set({ soundOn: on === true })
    .where(eq(userTable.id, user.id));
}
