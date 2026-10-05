"use client";

import type { WhotView } from "@gamehub/engine/whot";
import type { SeatPublic } from "@gamehub/protocol";
import { useEffect, useRef, useState } from "react";
import { useRoom, type RoomEvent } from "@/lib/room/store";
import { seatName } from "../rps/names";
import { SHAPE_NAMES } from "./whot-card";
import { sfx } from "../sounds";

type Sound = keyof typeof sfx;
const PRIORITY: Sound[] = ["penalty", "special", "lastCard", "market", "play"];

/**
 * Turns game events into a short line ("General market!", "@ada picked 2") and a sound,
 * and chimes when it becomes your turn. One sound per update, the most important one.
 */
export function useWhotFeed(seats: SeatPublic[], me: number | null) {
  const [line, setLine] = useState<{ text: string; n: number } | null>(null);
  // Every snapshot brings a new seats array; read it through a ref so the subscription
  // (and the timer that clears the line) isn't torn down on each update.
  const seatsRef = useRef(seats);
  useEffect(() => {
    seatsRef.current = seats;
  }, [seats]);

  useEffect(() => {
    const who = (seat: unknown) => (seat === me ? "You" : seatName(seatsRef.current, Number(seat)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seen = useRoom.getState().events.at(-1)?.n ?? 0;

    const unsub = useRoom.subscribe((s, prev) => {
      const sounds = new Set<Sound>();
      let text: string | null = null;
      if (s.events !== prev.events) {
        const fresh = s.events.filter((x) => x.n > seen);
        seen = s.events.at(-1)?.n ?? seen;
        let afterPenalty = false;
        for (const { e } of fresh) {
          const t = describe(e, who, me, afterPenalty);
          afterPenalty = e.type === "penalty";
          if (t.text) text = t.text;
          if (t.sound) sounds.add(t.sound);
        }
      }
      // Your turn just started.
      const v = s.snap?.view as WhotView | undefined;
      const pv = prev.snap?.view as WhotView | undefined;
      if (me !== null && v && !v.over && v.turn === me && (pv?.turn !== me || !prev.snap)) {
        sounds.add("special");
      }
      if (v?.over && !pv?.over && v.places?.[0]?.includes(me ?? -1)) sfx.win();
      else if (s.soundOn) {
        const pick = PRIORITY.find((p) => sounds.has(p));
        if (pick) sfx[pick]();
      }
      if (text) {
        const n = Date.now();
        setLine({ text, n });
        clearTimeout(timer);
        timer = setTimeout(() => setLine((l) => (l?.n === n ? null : l)), 2400);
      }
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [me]);

  return line?.text ?? null;
}

function describe(
  e: RoomEvent,
  who: (seat: unknown) => string,
  me: number | null,
  afterPenalty: boolean,
): { text?: string; sound?: Sound } {
  switch (e.type) {
    case "played":
      return { sound: "play" };
    case "pick_two":
    case "pick_three":
      return { text: `Pick ${String(e.amount)}!`, sound: "penalty" };
    case "hold_on":
      return { text: "Hold on", sound: "special" };
    case "suspension":
      return {
        text:
          e.skipped === me
            ? "Suspension. You miss a turn"
            : `Suspension. ${who(e.skipped)} misses a turn`,
        sound: "special",
      };
    case "general_market":
      return { text: "General market!", sound: "special" };
    case "whot":
      return {
        text: `Whot! Calling ${SHAPE_NAMES[e.shape as keyof typeof SHAPE_NAMES] ?? ""}`,
        sound: "special",
      };
    case "penalty":
      return e.reason === "last_card"
        ? { text: `${who(e.seat)} forgot Last card. Pick ${String(e.count)}`, sound: "penalty" }
        : { text: `${who(e.seat)} picked ${String(e.count)}`, sound: "penalty" };
    case "went_market":
      return afterPenalty
        ? { sound: "market" }
        : { text: `${who(e.seat)} went to market`, sound: "market" };
    case "last_card":
      return { text: `${who(e.seat)}: Last card!`, sound: "lastCard" };
    case "reshuffled":
      return { text: "Market reshuffled" };
    case "market_empty":
      return { text: "Market finished. Counting cards" };
    case "finished":
      return { text: e.seat === me ? "You're out!" : `${who(e.seat)} is out!` };
    default:
      return {};
  }
}
