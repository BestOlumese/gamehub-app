"use client";

import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Bot, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { seatName } from "../rps/names";
import { SeatChip } from "../seat-chip";
import { ThinkingRing, TimerRing } from "../timer-ring";
import { CardBack } from "./whot-card";

export type SeatInfo = {
  seat: number;
  count: number;
  lastCard: boolean;
  place: string | undefined;
  /** It's this seat's move. */
  active: boolean;
  /** Their turn clock (humans only; bots have none). */
  clock: { endsAt: number; totalMs: number } | null;
};

/** "Bot 2 (Hard)" → "Bot 2": the level doesn't fit a small seat. */
const shortName = (seats: SeatPublic[], i: number) =>
  seatName(seats, i).replace(/ \((Easy|Medium|Hard)\)$/, "");

const AVATAR = 44;

function Face({ seat, size }: { seat: SeatPublic; size: number }) {
  return seat.userId ? (
    <Avatar username={seat.name || "?"} image={seat.avatar} size={size} />
  ) : (
    <span
      className="flex items-center justify-center rounded-full bg-surface-2 text-ink-2"
      style={{ width: size, height: size }}
    >
      <Bot size={size / 2} aria-hidden="true" />
    </span>
  );
}

/** One opponent round the table: avatar (timer ring on their turn), card-count badge, name. */
function OpponentSeat({
  info,
  seats,
  offset,
}: {
  info: SeatInfo;
  seats: SeatPublic[];
  offset: number;
}) {
  const seat = seats[info.seat];
  if (!seat) return null;
  const away = seat.status === "away";
  const covered = seat.status === "bot" && !!seat.userId;
  return (
    <li
      className="flex w-16 flex-col items-center gap-1"
      aria-label={`${seatName(seats, info.seat)}: ${info.place ? `finished ${info.place}` : `${info.count} ${info.count === 1 ? "card" : "cards"}`}${info.active ? ", playing now" : ""}${info.lastCard ? ", last card" : ""}${away ? ", offline" : ""}`}
    >
      <div
        className={`relative transition-transform duration-(--dur-turn) ease-standard ${info.active ? "scale-110" : ""}`}
        style={{ width: AVATAR, height: AVATAR }}
        aria-hidden="true"
      >
        {/* A paper-coloured gap keeps the ring readable on any avatar colour. */}
        <div className={`absolute inset-[5px] ${away ? "opacity-40 grayscale" : ""}`}>
          <Face seat={seat} size={AVATAR - 10} />
        </div>
        {info.active && info.clock ? (
          <TimerRing key={info.clock.endsAt} {...info.clock} offset={offset} size={AVATAR} />
        ) : info.active ? (
          <ThinkingRing size={AVATAR} />
        ) : null}
        {away || covered ? (
          <span className="absolute -top-1 -right-1 rounded-full bg-surface p-0.5 text-ink-2 shadow-sm">
            {away ? <WifiOff size={12} /> : <Bot size={12} />}
          </span>
        ) : null}
        <span
          className={`absolute -right-1.5 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums ring-2 ring-paper ${info.place ? "bg-accent text-ink" : "bg-whot text-white"}`}
        >
          {info.place ?? info.count}
        </span>
      </div>
      <span
        className={`max-w-full truncate rounded-full px-1.5 text-center text-xs ${info.active ? "bg-accent font-bold text-ink" : "font-semibold text-ink-2"}`}
        aria-hidden="true"
      >
        {shortName(seats, info.seat)}
      </span>
      {info.lastCard && !info.place ? (
        <span
          className="-mt-0.5 rounded-full bg-accent px-1.5 text-[10px] leading-4 font-extrabold tracking-wide uppercase"
          aria-hidden="true"
        >
          Last card
        </span>
      ) : null}
    </li>
  );
}

/** Two-player game: a full-width face-off card with their face-down hand fanned. */
export function DuelOpponent({
  info,
  seats,
  offset,
  graceEndsAt,
}: {
  info: SeatInfo;
  seats: SeatPublic[];
  offset: number;
  graceEndsAt: number | undefined;
}) {
  const seat = seats[info.seat];
  if (!seat) return null;
  const shown = Math.min(info.count, 8);
  return (
    <div
      className={`flex items-center gap-3 rounded-card border bg-surface p-3 shadow-sm ${info.active ? "border-accent" : "border-line"}`}
    >
      <div className="min-w-0 flex-1">
        <SeatChip
          seat={seat}
          turn={info.active ? info.clock : null}
          thinking={info.active && !info.clock}
          graceEndsAt={graceEndsAt}
          offset={offset}
          mark={
            info.lastCard ? (
              <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 font-extrabold tracking-wide uppercase">
                Last card
              </span>
            ) : null
          }
        />
      </div>
      <div className="flex items-center gap-2" aria-label={`${info.count} cards`}>
        <div className="flex" aria-hidden="true">
          {Array.from({ length: shown }, (_, i) => (
            <span key={i} className={i ? "-ml-3.5" : ""}>
              <CardBack width={20} />
            </span>
          ))}
        </div>
        <span className="font-display text-2xl font-extrabold tabular-nums" aria-hidden="true">
          {info.count}
        </span>
      </div>
    </div>
  );
}

type Slot = "l1" | "l2" | "tl" | "t" | "tr" | "r1" | "r2";

/**
 * Where opponents sit for each table size, in play order going clockwise from your left
 * (you're at the bottom). l2/r2 are the lower side seats, nearer you.
 */
const SLOTS: Record<number, Slot[]> = {
  2: ["tl", "tr"],
  3: ["l1", "t", "r1"],
  4: ["l1", "tl", "tr", "r1"],
  5: ["l1", "tl", "t", "tr", "r1"],
  6: ["l2", "l1", "tl", "tr", "r1", "r2"],
  7: ["l2", "l1", "tl", "t", "tr", "r1", "r2"],
};

type Props = {
  /** Opponents in play order after you. */
  opponents: SeatInfo[];
  seats: SeatPublic[];
  offset: number;
  graceEndsAt: Partial<Record<number, number>> | undefined;
  /** Market and call card. */
  children: ReactNode;
};

/** Opponents seated round the top and sides of the market and pile, like a real table. */
export function TableSeats({ opponents, seats, offset, graceEndsAt, children }: Props) {
  if (opponents.length <= 1) {
    const only = opponents[0];
    return (
      <div className="flex flex-1 flex-col gap-3">
        {only ? (
          <DuelOpponent
            info={only}
            seats={seats}
            offset={offset}
            graceEndsAt={graceEndsAt?.[only.seat]}
          />
        ) : null}
        <div className="flex flex-1 flex-col justify-center">
          <div className="flex min-h-40 items-center justify-center rounded-[44px] border border-line bg-board px-2 py-4 [@media(max-height:700px)]:min-h-0 [@media(max-height:700px)]:py-2">
            {children}
          </div>
        </div>
      </div>
    );
  }
  const slots = SLOTS[opponents.length] ?? [];
  const at = (slot: Slot) => {
    const k = slots.indexOf(slot);
    const info = opponents[k];
    return info ? <OpponentSeat key={info.seat} info={info} seats={seats} offset={offset} /> : null;
  };
  const sides = slots.some((s) => s[0] === "l");
  // Seats hug the table; the whole group sits in the middle of the free space.
  return (
    <div className="flex flex-1 flex-col justify-center" role="group" aria-label="Players">
      <ul className="mb-2 flex justify-evenly">
        {at("tl")}
        {at("t")}
        {at("tr")}
      </ul>
      <div
        className={`grid items-center ${sides ? "grid-cols-[64px_1fr_64px] gap-1" : "grid-cols-1"}`}
      >
        {sides ? (
          <ul className="flex h-full flex-col items-center justify-evenly gap-3">
            {at("l1")}
            {at("l2")}
          </ul>
        ) : null}
        <div className="flex min-h-40 items-center justify-center rounded-[44px] border border-line bg-board px-2 py-4 [@media(max-height:700px)]:min-h-0 [@media(max-height:700px)]:py-2">
          {children}
        </div>
        {sides ? (
          <ul className="flex h-full flex-col items-center justify-evenly gap-3">
            {at("r1")}
            {at("r2")}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
