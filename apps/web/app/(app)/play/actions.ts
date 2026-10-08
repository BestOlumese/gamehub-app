"use server";

import { gameFor } from "@/lib/playable-games";
import {
  createRoomRequest,
  type BotLevel,
  type CreateRoomResponse,
  type FirstPlayer,
} from "@gamehub/protocol";
import { signBody } from "@gamehub/protocol/hmac";
import type { GameSlug } from "@gamehub/engine";
import { redirect } from "next/navigation";
import { realtimeEnv } from "@/server/env";
import { requirePlayer } from "@/server/session";

export type CreateRoomResult = { ok: false; message: string };

/** Asks the realtime Worker for a new private room, then sends the host into it. */
export async function createRoom(input: {
  game: GameSlug;
  rules: unknown;
  botLevel: BotLevel | null;
  players: number;
  /** Bots take the empty seats now ("play a bot") instead of when the host starts. */
  seatBotsNow: boolean;
  firstPlayer: FirstPlayer;
}): Promise<CreateRoomResult> {
  const user = await requirePlayer();
  const def = gameFor(input.game);
  if (!def) return { ok: false, message: "That game isn't open yet." };
  const rules = def.ruleSchema.safeParse(input.rules);
  if (!rules.success) return { ok: false, message: "Those rules don't look right. Try again." };

  const body = JSON.stringify(
    createRoomRequest.parse({
      game: input.game,
      rules: rules.data,
      botLevel: input.botLevel,
      players: input.players,
      seatBotsNow: input.seatBotsNow,
      firstPlayer: input.firstPlayer,
      host: { userId: user.id, name: user.username, avatar: user.image ?? null },
    }),
  );
  const rt = realtimeEnv();
  const { ts, sig } = await signBody(rt.hmacSecret, body);
  let code: string;
  try {
    const res = await fetch(`${rt.url}/rooms`, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", "x-gh-ts": ts, "x-gh-sig": sig },
      cache: "no-store",
    });
    if (res.status !== 201)
      return { ok: false, message: "Couldn't make the room. Please try again." };
    code = ((await res.json()) as CreateRoomResponse).code;
  } catch {
    return {
      ok: false,
      message: "Couldn't reach the game server. Check your connection and try again.",
    };
  }
  redirect(`/r/${code}`);
}
