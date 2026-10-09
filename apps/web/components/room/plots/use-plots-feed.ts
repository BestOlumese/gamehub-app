"use client";

import { CARDS, naira, SPACES, type Deck, type PlotsState } from "@gamehub/engine/plots";
import type { SeatPublic } from "@gamehub/protocol";
import { useEffect, useRef, useState } from "react";
import { useRoom, type RoomEvent } from "@/lib/room/store";
import { seatName } from "../rps/names";
import { sfx } from "../sounds";
import { PlotsPlayback } from "./playback";

const nameOf = (space: unknown) => SPACES[Number(space)]?.name ?? "";

/** Plays events back at human pace (dice, hops), with a news line, the latest card and sounds. */
export function usePlotsFeed(seats: SeatPublic[], me: number | null) {
  const [pos, setPos] = useState<number[] | null>(null);
  const [dice, setDice] = useState<{ seat: number; dice: [number, number]; key: number } | null>(
    null,
  );
  const [line, setLine] = useState<{ text: string; n: number } | null>(null);
  const [card, setCard] = useState<{ deck: Deck; text: string; seat: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const seatsRef = useRef(seats);
  useEffect(() => {
    seatsRef.current = seats;
  }, [seats]);

  useEffect(() => {
    const who = (seat: unknown) =>
      Number(seat) === me ? "You" : seatName(seatsRef.current, Number(seat));
    const whom = (seat: unknown) =>
      Number(seat) === me ? "you" : seatName(seatsRef.current, Number(seat));
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
      lineTimer = setTimeout(() => setLine((l) => (l?.n === n ? null : l)), 3200);
    };
    let seen = useRoom.getState().events.at(-1)?.n ?? 0;

    const happen = (e: RoomEvent) => {
      const seat = e.seat;
      switch (e.type) {
        case "rolled": {
          sound(sfx.dice);
          const [a, b] = e.dice as [number, number];
          if (a === b && !e.extra)
            later(reduce ? 0 : 700, () => say(`${who(seat)} rolled doubles`));
          return;
        }
        case "salary":
          sound(sfx.special);
          return say(
            `Payday! ${who(seat)} ${Number(seat) === me ? "collect" : "collects"} ${naira(Number(e.amount))}`,
          );
        case "rent":
          sound(sfx.market);
          return say(
            Number(e.from) === me
              ? `You paid ${naira(Number(e.amount))} rent to ${whom(e.to)}`
              : `${who(e.from)} paid ${whom(e.to)} ${naira(Number(e.amount))} rent`,
          );
        case "card": {
          const deck = e.deck as Deck;
          const text = CARDS[deck][Number(e.id)]?.text ?? "";
          setCard({ deck, text, seat: Number(seat) });
          sound(sfx.play);
          return;
        }
        case "police":
          sound(sfx.penalty);
          return say(`${who(seat)} ${Number(seat) === me ? "go" : "goes"} to the Police Post`);
        case "released":
          return say(`${who(seat)} ${Number(seat) === me ? "are" : "is"} out of the Police Post`);
        case "bought":
          sound(sfx.castle);
          return say(`${who(seat)} bought ${nameOf(e.space)}`);
        case "auction_started":
          sound(sfx.turn);
          return say(`Auction: ${nameOf(e.space)}`);
        case "auction_won":
          sound(sfx.castle);
          return say(`${who(seat)} won ${nameOf(e.space)} for ${naira(Number(e.amount))}`);
        case "auction_unsold":
          return say(`Nobody bid. ${nameOf(e.space)} stays with the bank`);
        case "built":
          sound(sfx.special);
          return say(
            `${who(seat)} built ${Number(e.level) === 5 ? "a hotel" : "a house"} on ${nameOf(e.space)}`,
          );
        case "mortgaged":
          return say(`${who(seat)} mortgaged ${nameOf(e.space)}`);
        case "owes":
          sound(sfx.penalty);
          return say(
            Number(e.from) === me
              ? `You owe ${naira(Number(e.amount))}. Sell or mortgage to pay`
              : `${who(e.from)} can't pay ${naira(Number(e.amount))} yet`,
          );
        case "bankrupt":
          sound(sfx.penalty);
          return say(`${who(seat)} ${Number(seat) === me ? "are" : "is"} bankrupt`);
        case "jackpot":
          sound(sfx.win);
          return say(
            `Owambe! ${who(seat)} ${Number(seat) === me ? "collect" : "collects"} ${naira(Number(e.amount))}`,
          );
        case "offer_sent":
          if (Number(e.to) === me) {
            sound(sfx.turn);
            return say(`${who(e.from)} sent you an offer`);
          }
          return;
        case "offer_declined":
          if (Number(e.from) === me) return say(`${who(e.to)} said no to your offer`);
          return;
        case "trade_done":
          sound(sfx.castle);
          return say(`${who(e.from)} and ${whom(e.to)} made a trade`);
        case "last_round":
          sound(sfx.turn);
          return say("Time's up. Last round!");
        case "turn":
          setCard(null);
          if (Number(seat) === me) sound(sfx.turn);
          return;
      }
    };

    const playback = new PlotsPlayback(
      {
        board: (b) => {
          setPos(b);
          setPlaying(b !== null);
        },
        dice: setDice,
        event: happen,
        hop: () => sound(sfx.hop),
        wait: later,
      },
      reduce,
    );

    const unsub = useRoom.subscribe((s, prev) => {
      if (s.events === prev.events) return;
      const fresh = s.events.filter((x) => x.n > seen);
      seen = s.events.at(-1)?.n ?? seen;
      const view = s.snap?.view as PlotsState | undefined;
      if (fresh.length)
        playback.push(
          fresh.map((x) => x.e),
          view?.pos,
        );
    });
    return () => {
      unsub();
      timers.forEach(clearTimeout);
      clearTimeout(lineTimer);
    };
  }, [me]);

  return { pos, dice, line: line?.text ?? null, card, playing };
}
