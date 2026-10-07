"use client";

import { ROLL_SHOW_MS, type SnakesState } from "@gamehub/engine/snakes";
import type { SeatPublic } from "@gamehub/protocol";
import { useEffect, useRef, useState } from "react";
import { useRoom, type RoomEvent } from "@/lib/room/store";
import { ROLL_MS } from "../die";
import { seatName } from "../rps/names";
import { sfx } from "../sounds";
import type { Pt } from "./geometry";
import { SnakesPlayback } from "./playback";

type Roll = { seat: number; value: number; key: number; stale: boolean };

/** Plays the game's events back at human speed, with a message line and sounds. */
export function useSnakesFeed(seats: SeatPublic[], me: number | null) {
  const [roll, setRoll] = useState<Roll | null>(null);
  /** Your own last roll, kept on your die between your turns. */
  const [mine, setMine] = useState<{ value: number; key: number } | null>(null);
  const [squares, setSquares] = useState<number[] | null>(null);
  const [slide, setSlide] = useState<{ seat: number; at: Pt } | null>(null);
  const [actor, setActor] = useState<number | null>(null);
  const [line, setLine] = useState<{ text: string; n: number } | null>(null);
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
      lineTimer = setTimeout(() => setLine((l) => (l?.n === n ? null : l)), 2600);
    };
    let rolls = 0;
    let seen = useRoom.getState().events.at(-1)?.n ?? 0;

    const happen = (e: RoomEvent) => {
      const seat = Number(e.seat);
      switch (e.type) {
        case "rolled": {
          const value = Number(e.d);
          const key = ++rolls;
          setRoll({ seat, value, key, stale: false });
          if (seat === me) setMine({ value, key });
          later(ROLL_SHOW_MS + 1200, () =>
            setRoll((r) => (r?.key === key ? { ...r, stale: true } : r)),
          );
          sound(sfx.dice);
          if (value === 6) later(ROLL_MS, () => say(`${who(seat)} rolled a 6`));
          return;
        }
        case "ladder":
          sound(sfx.ladder);
          return say(`${who(seat)} climbed a ladder: ${String(e.from)} → ${String(e.to)}`);
        case "snake":
          sound(sfx.snake);
          return say(
            `${seat === me ? "You got" : `${who(seat)} got`} bitten: ${String(e.from)} → ${String(e.to)}`,
          );
        case "bumped":
          return say(
            `${who(seat)} bumped ${Number(e.victim) === me ? "you" : who(e.victim)} back to the start`,
          );
        case "no_move":
          return say(
            e.reason === "overshoot"
              ? seat === me
                ? "Too far. You need the exact number for 100"
                : `${who(seat)} rolled too far`
              : seat === me
                ? "You need a 6 to start"
                : `${who(seat)} needs a 6 to start`,
          );
        case "six_forfeit":
          return say(
            seat === me
              ? "Three sixes. Your turn is over"
              : `Three sixes. ${who(seat)}'s turn is over`,
          );
        case "finished":
          sound(sfx.special);
          return say(seat === me ? "You made it to 100!" : `${who(seat)} made it to 100!`);
      }
    };

    const playback = new SnakesPlayback(
      {
        board: setSquares,
        slide: setSlide,
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
        const view = s.snap?.view as SnakesState | undefined;
        if (fresh.length)
          playback.push(
            fresh.map((x) => x.e),
            view?.pos,
          );
      }
      const v = s.snap?.view as SnakesState | undefined;
      const pv = prev.snap?.view as SnakesState | undefined;
      if (me !== null && v && pv && !v.over && v.turn === me && pv.turn !== me) sound(sfx.turn);
      if (v?.over && pv && !pv.over && v.places?.[0]?.includes(me ?? -1)) sound(sfx.win);
    });
    return () => {
      unsub();
      timers.forEach(clearTimeout);
      clearTimeout(lineTimer);
    };
  }, [me]);

  return { roll, mine, squares, slide, actor, playing: actor !== null, line: line?.text ?? null };
}
