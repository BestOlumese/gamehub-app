import "server-only";
import { block, friendRequest, friendship, user } from "@gamehub/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "./db";

export type Person = { id: string; username: string; image: string | null };

/** A friendship is stored once per pair, smaller id first. */
export const pair = (a: string, b: string) =>
  a < b ? { userA: a, userB: b } : { userA: b, userB: a };

/** How `me` stands with `other` (for the profile's button). */
export type Relation =
  "self" | "friends" | "sent" | "received" | "blocked" | "blocked_you" | "none";

export async function relationOf(me: string, other: string): Promise<Relation> {
  if (me === other) return "self";
  const db = getDb();
  const p = pair(me, other);
  const [friends, sent, received, blocks] = await Promise.all([
    db
      .select({ a: friendship.userA })
      .from(friendship)
      .where(and(eq(friendship.userA, p.userA), eq(friendship.userB, p.userB))),
    db
      .select({ a: friendRequest.fromId })
      .from(friendRequest)
      .where(and(eq(friendRequest.fromId, me), eq(friendRequest.toId, other))),
    db
      .select({ a: friendRequest.fromId })
      .from(friendRequest)
      .where(and(eq(friendRequest.fromId, other), eq(friendRequest.toId, me))),
    db
      .select({ by: block.blockerId })
      .from(block)
      .where(
        or(
          and(eq(block.blockerId, me), eq(block.blockedId, other)),
          and(eq(block.blockerId, other), eq(block.blockedId, me)),
        ),
      ),
  ]);
  if (blocks.some((b) => b.by === me)) return "blocked";
  if (blocks.length) return "blocked_you";
  if (friends.length) return "friends";
  if (sent.length) return "sent";
  if (received.length) return "received";
  return "none";
}

export const areFriends = async (a: string, b: string) => (await relationOf(a, b)) === "friends";

/** Your friends, and requests both ways. */
export async function friendsOf(
  me: string,
): Promise<{ friends: Person[]; incoming: Person[]; outgoing: Person[] }> {
  const db = getDb();
  const [pairs, inc, out] = await Promise.all([
    db
      .select()
      .from(friendship)
      .where(or(eq(friendship.userA, me), eq(friendship.userB, me))),
    db.select({ id: friendRequest.fromId }).from(friendRequest).where(eq(friendRequest.toId, me)),
    db.select({ id: friendRequest.toId }).from(friendRequest).where(eq(friendRequest.fromId, me)),
  ]);
  const ids = [
    ...new Set([
      ...pairs.map((p) => (p.userA === me ? p.userB : p.userA)),
      ...inc.map((r) => r.id),
      ...out.map((r) => r.id),
    ]),
  ];
  const people = ids.length
    ? await db
        .select({ id: user.id, username: user.username, image: user.image })
        .from(user)
        .where(inArray(user.id, ids))
    : [];
  const byId = new Map(
    people.flatMap((p) =>
      p.username ? [[p.id, { id: p.id, username: p.username, image: p.image }]] : [],
    ),
  );
  const pick = (list: string[]) =>
    list
      .map((id) => byId.get(id))
      .filter((p): p is Person => !!p)
      .sort((a, b) => a.username.localeCompare(b.username));
  return {
    friends: pick(pairs.map((p) => (p.userA === me ? p.userB : p.userA))),
    incoming: pick(inc.map((r) => r.id)),
    outgoing: pick(out.map((r) => r.id)),
  };
}

export async function userByUsername(username: string): Promise<Person | null> {
  const [u] = await getDb()
    .select({ id: user.id, username: user.username, image: user.image })
    .from(user)
    .where(eq(user.username, username.trim().replace(/^@/, "").toLowerCase()));
  return u?.username ? { id: u.id, username: u.username, image: u.image } : null;
}
