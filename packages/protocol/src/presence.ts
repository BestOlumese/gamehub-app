// Presence: who's online, who's in a game, invites (docs/03-realtime-protocol.md → Presence).
import type { GameSlug } from "@gamehub/engine";
import { z } from "zod";
import { gameSlugSchema } from "./game-slug";

export const clientPresenceMsg = z.discriminatedUnion("t", [
  z.object({ t: z.literal("p_hello") }),
  /** Your friends (the server tells you when they come and go). */
  z.object({ t: z.literal("p_watch"), userIds: z.array(z.string().min(1).max(64)).max(200) }),
  z.object({ t: z.literal("ping"), c: z.number() }),
]);
export type ClientPresenceMsg = z.infer<typeof clientPresenceMsg>;

/** Where someone is playing (people who can watch get the code). */
export type InGame = {
  game: GameSlug;
  code: string;
  kind: "private" | "quick" | "tournament";
};

export type FriendStatus = {
  online: boolean;
  inGame: InGame | null;
  /** In a tournament (between tables too). */
  inTournament: { code: string; name: string } | null;
};

export type Invite = {
  id: string;
  from: { id: string; name: string; avatar: string | null };
  kind: "room" | "tournament";
  code: string;
  /** The game (rooms), or the tournament's name. */
  game: GameSlug | null;
  name: string | null;
  expiresAt: number;
};

export type ServerPresenceMsg =
  | { t: "p_status"; statuses: Record<string, FriendStatus> }
  | { t: "p_update"; userId: string; status: FriendStatus }
  | { t: "p_invite"; invite: Invite }
  | { t: "pong"; c: number; s: number }
  | { t: "error"; code: "BAD_MESSAGE" | "RATE_LIMIT" };

/** web → Worker (HMAC): deliver an invite (web has checked the session and the friendship). */
export const inviteRequest = z.object({
  to: z.string().min(1).max(64),
  from: z.object({ id: z.string().min(1), name: z.string().min(1), avatar: z.string().nullable() }),
  kind: z.enum(["room", "tournament"]),
  code: z.string().min(6).max(7),
  game: gameSlugSchema.nullable(),
  name: z.string().max(40).nullable(),
});
export type InviteRequest = z.infer<typeof inviteRequest>;

/** Invites last this long. */
export const INVITE_MS = 2 * 60_000;
