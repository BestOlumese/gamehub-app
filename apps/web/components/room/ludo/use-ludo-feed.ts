"use client";

import { ROLL_SHOW_MS, type LudoState } from "@gamehub/engine/ludo";
import type { SeatPublic } from "@gamehub/protocol";
import { useEffect, useRef, useState } from "react";
import { useRoom, type RoomEvent } from "@/lib/room/store";
import { seatName } from "../rps/names";
import { sfx } from "../sounds";
import { ROLL_MS } from "./die";
import { LudoPlayback } from "./playback";

type Roll = { seat: number; value: number; key: number; stale: boolean };

/**
 * Plays game events back at human speed. The server applies a whole turn at once (roll,
 * move, bonus roll, move…), so events arrive in a burst; this queues them and shows the
 * die tumbling, each seed hopping square by square, captures as the hopper lands, a short
 * message line and sounds. While it plays, `seeds` is the board as it should look so far.
 */
export function useLudoFeed(seats: SeatPublic[], me: number | null) {
  const [roll, setRoll] = useState<Roll | null>(null);
  const [seeds, setSeeds] = useState<number[][] | null>(null);
  const [actor, setActor] = useState<number | null>(null);
  const [line, setLine] = useState<{ text: string; n: number } | null>(null);
  // Every snapshot brings new arrays; read the latest through a ref so the subscription
  // (and its timers) isn't torn down mid-playback.
  const seatsRef = useRef(seats);
  useEffect(() => {
    seatsRef.current = seats;
  }, [seats]);

  useEffect(() => {
    const who = (seat: unknown) => (seat === me ? "You" : seatName(seatsRef.current, Number(seat)));
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };
    const sound = (play: () => void) => useRoom.getState().soundOn && play();
    let lineTimer: ReturnType<typeof setTimeout> | undefined;
    const say = (text: string) => {
      const n = Date.now();
      setLine({ text, n });
      clearTimeout(lineTimer);
      lineTimer = setTimeout(() => setLine((l) => (l?.n === n ? null : l)), 2400);
    };

    let rolls = 0;
    let seen = useRoom.getState().events.at(-1)?.n ?? 0;

    // What each event looks and sounds like when its moment comes in the playback.
    const happen = (e: RoomEvent) => {
      const seat = Number(e.seat);
      switch (e.type) {
        case "rolled": {
          const value = Number(e.d);
          const key = ++rolls;
          setRoll({ seat, value, key, stale: false });
          later(ROLL_SHOW_MS + 1200, () =>
            setRoll((r) => (r?.key === key ? { ...r, stale: true } : r)),
          );
          sound(sfx.dice);
          if (value === 6) later(ROLL_MS, () => say(`${who(seat)} rolled a 6`));
          return;
        }
        case "captured": {
          const victim = Number(e.victimSeat);
          sound(sfx.capture);
          return say(
            Number(e.by) === me
              ? `You sent ${who(victim)} home!`
              : `${who(e.by)} sent ${victim === me ? "you" : who(victim)} home`,
          );
        }
        case "six_forfeit":
          return say(
            seat === me
              ? "Three sixes. Your turn is over"
              : `Three sixes. ${who(seat)}'s turn is over`,
          );
        case "no_move":
          return say(seat === me ? "No move this time" : `${who(seat)} can't move`);
        case "entered_home":
          sound(sfx.special);
          return say(seat === me ? "Seed home!" : `${who(seat)} got a seed home`);
        case "finished":
          return say(seat === me ? "All your seeds are home!" : `${who(seat)} is home and dry`);
      }
    };

    const playback = new LudoPlayback(
      {
        board: setSeeds,
        actor: setActor,
        event: happen,
        hop: () => sound(sfx.hop),
        wait: later,
      },
      reduce,
    );

    const unsub = useRoom.subscribe((s, prev) => {
      if (s.events !== prev.events) {
        const fresh = s.events.filter((x) => x.n > seen);
        seen = s.events.at(-1)?.n ?? seen;
        // Events arrive before their snapshot, so this is still the board before them.
        const view = s.snap?.view as LudoState | undefined;
        if (fresh.length)
          playback.push(
            fresh.map((x) => x.e),
            view?.seeds,
          );
      }
      const v = s.snap?.view as LudoState | undefined;
      const pv = prev.snap?.view as LudoState | undefined;
      if (
        me !== null &&
        v &&
        pv &&
        !v.over &&
        v.turn === me &&
        v.phase === "roll" &&
        pv.turn !== me
      )
        sound(sfx.turn);
      if (v?.over && pv && !pv.over && v.places?.[0]?.includes(me ?? -1)) sound(sfx.win);
    });
    return () => {
      unsub();
      timers.forEach(clearTimeout);
      clearTimeout(lineTimer);
    };
  }, [me]);

  return { roll, seeds, actor, playing: actor !== null, line: line?.text ?? null };
}
