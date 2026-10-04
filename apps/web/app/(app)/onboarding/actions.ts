"use server";

import { user as userTable } from "@gamehub/db";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdult, todayInLagos } from "@/lib/age";
import { dobSchema } from "@/lib/dob";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import { getSession, requireUser } from "@/server/session";
import { checkUsernameRules, takenUsernames, type UsernameCheck } from "@/server/username";

export type AgeResult =
  { status: "ok" } | { status: "under18" } | { status: "error"; message: string };

/** Google sign-ups confirm 18+ here. Under 18: the account is deleted on the spot. */
export async function confirmAge(_prev: AgeResult | null, form: FormData): Promise<AgeResult> {
  const user = await requireUser({ fresh: true });
  if (user.adultConfirmedAt) return { status: "ok" };

  const dob = dobSchema.safeParse({
    day: form.get("day"),
    month: form.get("month"),
    year: form.get("year"),
  });
  if (!dob.success) return { status: "error", message: "Enter your date of birth." };

  if (!isAdult(dob.data, todayInLagos(new Date()))) {
    const h = await headers();
    await getAuth().api.signOut({ headers: h });
    await getDb().delete(userTable).where(eq(userTable.id, user.id)); // sessions + accounts cascade
    return { status: "under18" };
  }

  await getDb()
    .update(userTable)
    .set({ adultConfirmedAt: new Date() })
    .where(eq(userTable.id, user.id));
  await getSession({ fresh: true }); // refresh the session cookie cache the proxy reads
  return { status: "ok" };
}

/** Live availability check while typing. */
export async function checkUsername(raw: string): Promise<UsernameCheck> {
  const user = await requireUser();
  const rules = checkUsernameRules(raw);
  if (!rules.ok) return rules;
  if (rules.username === user.username) return rules;
  const taken = await takenUsernames([rules.username]);
  return taken.has(rules.username) ? { ok: false, reason: "taken" } : rules;
}

/** Success redirects to /home, so only failures are ever returned. */
export type SaveUsernameResult = {
  ok: false;
  reason: Exclude<UsernameCheck, { ok: true }>["reason"];
};

export async function saveUsername(raw: string): Promise<SaveUsernameResult> {
  const user = await requireUser({ fresh: true });
  if (!user.adultConfirmedAt) return { ok: false, reason: "not_allowed" };
  if (user.username) redirect("/home");

  const check = await checkUsername(raw);
  if (!check.ok) return check;
  try {
    await getDb()
      .update(userTable)
      .set({ username: check.username })
      .where(and(eq(userTable.id, user.id), isNull(userTable.username)));
  } catch {
    return { ok: false, reason: "taken" }; // lost a race to the unique index
  }
  await getSession({ fresh: true }); // writes the updated cookie cache into this response
  redirect("/home");
}
