"use client";

import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Bot, WifiOff } from "lucide-react";
import { TimerRing } from "../timer-ring";
import { seatName } from "../rps/names";
import { CardBack } from "./whot-card";

type Props = {
  seats: SeatPublic[];
  order: number[];
  counts: number[];
  turn: number | null;
  turnClock: { endsAt: number; totalMs: number } | null;
  offset: number;
  lastCard: boolean[];
  places: Map<number, string>;
};

const SIZE = 44;

/** Everyone else, in play order after you. Scrolls sideways at big tables. */
export function Opponents({
  seats,
  order,
  counts,
  turn,
  turnClock,
  offset,
  lastCard,
  places,
}: Props) {
  return (
    <ul
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
      aria-label="Players"
    >
      {order.map((i) => {
        const seat = seats[i];
        if (!seat) return null;
        const active = turn === i;
        const away = seat.status === "away";
        const place = places.get(i);
        return (
          <li
            key={i}
            className={`flex w-[86px] shrink-0 snap-start flex-col items-center gap-1 rounded-card border bg-surface px-1.5 py-2 shadow-sm transition-colors duration-(--dur-turn) ${active ? "border-accent" : "border-line"}`}
            aria-label={`${seatName(seats, i)}: ${counts[i] ?? 0} cards${active ? ", playing now" : ""}${lastCard[i] ? ", last card" : ""}`}
          >
            <div className="relative" style={{ width: SIZE, height: SIZE }}>
              <div className={`absolute inset-[3px] ${away ? "opacity-40 grayscale" : ""}`}>
                {seat.userId ? (
                  <Avatar username={seat.name || "?"} image={seat.avatar} size={SIZE - 6} />
                ) : (
                  <span className="flex size-full items-center justify-center rounded-full bg-surface-2 text-ink-2">
                    <Bot size={20} aria-hidden="true" />
                  </span>
                )}
              </div>
              {active && turnClock ? (
                <TimerRing key={turnClock.endsAt} {...turnClock} offset={offset} size={SIZE} />
              ) : null}
              {away ? (
                <span className="absolute -right-1 -bottom-1 rounded-full bg-surface p-0.5 text-ink-2">
                  <WifiOff size={12} aria-hidden="true" />
                </span>
              ) : seat.status === "bot" && seat.userId ? (
                <span className="absolute -right-1 -bottom-1 rounded-full bg-surface p-0.5 text-ink-2">
                  <Bot size={12} aria-hidden="true" />
                </span>
              ) : null}
            </div>
            <span className="w-full truncate text-center text-xs font-semibold" aria-hidden="true">
              {seatName(seats, i)}
            </span>
            {place ? (
              <span className="rounded-full bg-accent px-2 text-xs font-bold" aria-hidden="true">
                {place}
              </span>
            ) : (
              <span
                className="flex items-center gap-1 text-sm font-bold tabular-nums"
                aria-hidden="true"
              >
                <CardBack width={11} />
                {counts[i] ?? 0}
              </span>
            )}
            {lastCard[i] && !place ? (
              <span
                className="rounded-full bg-accent-soft px-1.5 text-[11px] font-bold text-ink"
                aria-hidden="true"
              >
                Last card
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
