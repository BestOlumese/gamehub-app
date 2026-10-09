"use client";

import type { Colour } from "@gamehub/engine/draughts";
import { useEffect, useState } from "react";
import { DRAUGHTS_COLOUR } from "@/lib/game-meta";
import { useRoom, type RoomEvent } from "@/lib/room/store";
import { sfx } from "../sounds";

/** Sounds for each move and a short line for crowns, huffs, offers, takebacks and flags. */
export function useDraughtsFeed(you: Colour | null) {
  const [line, setLine] = useState<{ text: string; n: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seen = useRoom.getState().events.at(-1)?.n ?? 0;
    const who = (side: unknown) => (side === you ? "You" : (DRAUGHTS_COLOUR[side as Colour] ?? ""));
    const say = (text: string) => {
      const n = Date.now();
      setLine({ text, n });
      clearTimeout(timer);
      timer = setTimeout(() => setLine((l) => (l?.n === n ? null : l)), 3000);
    };
    const unsub = useRoom.subscribe((s, prev) => {
      if (s.events === prev.events) return;
      const fresh = s.events.filter((x) => x.n > seen);
      seen = s.events.at(-1)?.n ?? seen;
      let sound: (() => void) | null = null;
      for (const { e } of fresh) {
        const t = describe(e, who, you);
        if (t.text) say(t.text);
        if (t.sound) sound = t.sound;
      }
      if (sound && useRoom.getState().soundOn) sound();
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [you]);

  return line?.text ?? null;
}

function describe(
  e: RoomEvent,
  who: (side: unknown) => string,
  you: Colour | null,
): { text?: string; sound?: () => void } {
  switch (e.type) {
    case "moved": {
      const taken = Array.isArray(e.captured) ? e.captured.length : 0;
      return {
        text: e.crowned
          ? `${who(e.side)} crowned a king`
          : taken > 1
            ? `${who(e.side)} took ${taken}`
            : undefined,
        sound: e.crowned ? sfx.castle : taken ? sfx.take : sfx.move,
      };
    }
    case "huffed":
      return {
        text: e.side === you ? "You huffed a seed" : `${who(e.side)} huffed your seed`,
        sound: sfx.penalty,
      };
    case "draw_offered":
      return {
        text: e.by === you ? "You offered a draw" : `${who(e.by)} offers a draw`,
        sound: sfx.turn,
      };
    case "draw_declined":
      return { text: e.by === you ? "You declined the draw" : `${who(e.by)} declined the draw` };
    case "takeback_requested":
      return {
        text: e.by === you ? "You asked to take back" : `${who(e.by)} wants to take back`,
        sound: sfx.turn,
      };
    case "takeback_done":
      return { text: "Move taken back", sound: sfx.move };
    case "takeback_declined":
      return { text: "No takeback" };
    case "flagged":
      return { text: `${who(e.side)} ran out of time` };
    case "game_over":
      return e.reason === "aborted"
        ? { text: "Game aborted: nobody moved in time" }
        : { sound: e.winner && e.winner === you ? sfx.win : e.winner ? sfx.penalty : sfx.draw };
    default:
      return {};
  }
}
