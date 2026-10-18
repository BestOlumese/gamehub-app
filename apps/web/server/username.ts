import "server-only";
import { user } from "@gamehub/db";
import { inArray } from "drizzle-orm";
import { isOffensiveName } from "@gamehub/protocol/moderation";
import { normalizeUsername, USERNAME_MAX, usernameFormatProblem } from "@/lib/username";
import { getDb } from "./db";

const RESERVED = new Set([
  "admin",
  "administrator",
  "mod",
  "moderator",
  "staff",
  "support",
  "help",
  "official",
  "team",
  "system",
  "root",
  "gamehub",
  "game_hub",
  "bot",
  "bots",
  "guest",
  "player",
  "anonymous",
  "deleted",
  "deleted_player",
  "null",
  "undefined",
  "me",
  "you",
  "everyone",
  "api",
  "login",
  "signup",
  "settings",
  "onboarding",
  "home",
  "play",
  "whot",
  "ludo",
]);

/** Offensive names: English profanity or the Naija list (shared with chat moderation). */
export const isOffensive = isOffensiveName;

export type UsernameCheck =
  | { ok: true; username: string }
  | {
      ok: false;
      reason: "too_short" | "too_long" | "bad_chars" | "edge_underscore" | "not_allowed" | "taken";
    };

/** Format, reserved, profanity. No DB access. */
export function checkUsernameRules(raw: string): UsernameCheck {
  const name = normalizeUsername(raw);
  const problem = usernameFormatProblem(name);
  if (problem) return { ok: false, reason: problem };
  if (RESERVED.has(name) || isOffensive(name)) return { ok: false, reason: "not_allowed" };
  return { ok: true, username: name };
}

export async function takenUsernames(names: string[]): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const rows = await getDb()
    .select({ u: user.username })
    .from(user)
    .where(inArray(user.username, names));
  return new Set(rows.map((r) => r.u).filter((u): u is string => u !== null));
}

/** Turn "Tunde Ola" or "tunde.ola99@gmail.com" into a username-safe base. */
export function usernameBase(source: string): string {
  const local = source.split("@")[0] ?? source;
  const base = local
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, USERNAME_MAX - 3)
    .replace(/_+$/g, "");
  return base.length >= 3 ? base : `player_${base}`.replace(/_+$/, "");
}

/** Up to 3 available, allowed suggestions. */
export async function suggestUsernames(source: string, rand = Math.random): Promise<string[]> {
  const base = usernameBase(source);
  const first = base.split("_")[0] ?? base;
  const n = () => String(10 + Math.floor(rand() * 90));
  const candidates = [
    base,
    `${first}_${n()}`,
    `${base}${n()}`,
    `${first}${n()}`,
    `${first}_${n()}${n()}`,
    `naija_${first}`.slice(0, USERNAME_MAX),
  ].filter((c, i, all) => all.indexOf(c) === i && checkUsernameRules(c).ok);
  const taken = await takenUsernames(candidates);
  return candidates.filter((c) => !taken.has(c)).slice(0, 3);
}
