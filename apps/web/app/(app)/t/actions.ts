"use server";

import {
  createTournamentRequest,
  type CreateTournamentResponse,
  type TournamentConfig,
} from "@gamehub/protocol";
import { signBody } from "@gamehub/protocol/hmac";
import { redirect } from "next/navigation";
import { realtimeEnv } from "@/server/env";
import { requirePlayer } from "@/server/session";

export type CreateTournamentResult = { ok: false; message: string; problems?: string[] };

/** Asks the realtime Worker for a new tournament lobby, then sends the host into it. */
export async function createTournament(config: TournamentConfig): Promise<CreateTournamentResult> {
  const user = await requirePlayer();
  const parsed = createTournamentRequest.safeParse({
    config,
    host: { userId: user.id, name: user.username, avatar: user.image ?? null },
  });
  if (!parsed.success) return { ok: false, message: "Something in the setup doesn't look right." };
  const body = JSON.stringify(parsed.data);
  const rt = realtimeEnv();
  const { ts, sig } = await signBody(rt.hmacSecret, body);
  let code: string;
  try {
    const res = await fetch(`${rt.url}/tournaments`, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", "x-gh-ts": ts, "x-gh-sig": sig },
      cache: "no-store",
    });
    if (res.status === 400) {
      const out = (await res.json().catch(() => ({}))) as { errors?: string[] };
      return { ok: false, message: "The plan doesn't work yet.", problems: out.errors ?? [] };
    }
    if (res.status !== 201)
      return { ok: false, message: "Couldn't make the tournament. Please try again." };
    code = ((await res.json()) as CreateTournamentResponse).code;
  } catch {
    return {
      ok: false,
      message: "Couldn't reach the game server. Check your connection and try again.",
    };
  }
  redirect(`/t/${code}`);
}
