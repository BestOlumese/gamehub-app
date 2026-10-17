"use server";

import { block, friendRequest, friendship } from "@gamehub/db";
import { inviteRequest, type InviteRequest } from "@gamehub/protocol";
import { signBody } from "@gamehub/protocol/hmac";
import type { GameSlug } from "@gamehub/engine";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/server/db";
import { realtimeEnv } from "@/server/env";
import { pair, relationOf, userByUsername } from "@/server/friends";
import { requirePlayer } from "@/server/session";

export type FriendResult = { ok: true; message?: string } | { ok: false; message: string };

/** Send a request (by @username or id). If they already asked you, you're friends now. */
export async function addFriend(target: { username?: string; id?: string }): Promise<FriendResult> {
  const me = await requirePlayer();
  const db = getDb();
  const other = target.username
    ? await userByUsername(target.username)
    : target.id
      ? { id: target.id }
      : null;
  if (!other) return { ok: false, message: "Nobody has that username." };
  const rel = await relationOf(me.id, other.id);
  switch (rel) {
    case "self":
      return { ok: false, message: "That's you." };
    case "friends":
      return { ok: true, message: "You're already friends." };
    case "sent":
      return { ok: true, message: "Request already sent." };
    case "blocked":
      return { ok: false, message: "Unblock them first." };
    case "blocked_you":
      // Say nothing that gives the block away.
      return { ok: true, message: "Request sent." };
    case "received":
      await db
        .delete(friendRequest)
        .where(and(eq(friendRequest.fromId, other.id), eq(friendRequest.toId, me.id)));
      await db.insert(friendship).values(pair(me.id, other.id)).onConflictDoNothing();
      return { ok: true, message: "You're friends now." };
    default:
      await db
        .insert(friendRequest)
        .values({ fromId: me.id, toId: other.id })
        .onConflictDoNothing();
      return { ok: true, message: "Request sent." };
  }
}

export async function acceptFriend(fromId: string): Promise<FriendResult> {
  const me = await requirePlayer();
  const db = getDb();
  const removed = await db
    .delete(friendRequest)
    .where(and(eq(friendRequest.fromId, fromId), eq(friendRequest.toId, me.id)))
    .returning({ id: friendRequest.fromId });
  if (!removed.length) return { ok: false, message: "That request has gone." };
  await db.insert(friendship).values(pair(me.id, fromId)).onConflictDoNothing();
  return { ok: true };
}

/** Decline a request to you, or cancel one you sent. */
export async function dropRequest(otherId: string): Promise<FriendResult> {
  const me = await requirePlayer();
  await getDb()
    .delete(friendRequest)
    .where(
      or(
        and(eq(friendRequest.fromId, otherId), eq(friendRequest.toId, me.id)),
        and(eq(friendRequest.fromId, me.id), eq(friendRequest.toId, otherId)),
      ),
    );
  return { ok: true };
}

export async function removeFriend(otherId: string): Promise<FriendResult> {
  const me = await requirePlayer();
  const p = pair(me.id, otherId);
  await getDb()
    .delete(friendship)
    .where(and(eq(friendship.userA, p.userA), eq(friendship.userB, p.userB)));
  return { ok: true };
}

/** Block: no friendship, no requests, no invites, both ways. */
export async function blockUser(otherId: string): Promise<FriendResult> {
  const me = await requirePlayer();
  if (otherId === me.id) return { ok: false, message: "That's you." };
  const db = getDb();
  await removeFriend(otherId);
  await dropRequest(otherId);
  await db.insert(block).values({ blockerId: me.id, blockedId: otherId }).onConflictDoNothing();
  return { ok: true };
}

export async function unblockUser(otherId: string): Promise<FriendResult> {
  const me = await requirePlayer();
  await getDb()
    .delete(block)
    .where(and(eq(block.blockerId, me.id), eq(block.blockedId, otherId)));
  return { ok: true };
}

/** Invite a friend to your room or tournament: checked here, delivered by the game server. */
export async function inviteFriend(input: {
  to: string;
  kind: "room" | "tournament";
  code: string;
  game: GameSlug | null;
  name: string | null;
}): Promise<FriendResult> {
  const me = await requirePlayer();
  if ((await relationOf(me.id, input.to)) !== "friends")
    return { ok: false, message: "You can only invite friends." };
  const req: InviteRequest = inviteRequest.parse({
    ...input,
    from: { id: me.id, name: me.username, avatar: me.image ?? null },
  });
  const body = JSON.stringify(req);
  const rt = realtimeEnv();
  const { ts, sig } = await signBody(rt.hmacSecret, body);
  try {
    const res = await fetch(`${rt.url}/presence/invite`, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", "x-gh-ts": ts, "x-gh-sig": sig },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, message: "Couldn't send the invite. Try again." };
    const { delivered } = (await res.json()) as { delivered: boolean };
    return delivered
      ? { ok: true, message: "Invite sent." }
      : { ok: false, message: "They're not online right now." };
  } catch {
    return { ok: false, message: "Couldn't reach the game server." };
  }
}
