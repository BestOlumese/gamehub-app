"use client";

import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Bot, WifiOff } from "lucide-react";
import { seatName } from "../rps/names";
import { ThinkingRing, TimerRing } from "../timer-ring";
import { SHAPE_PATHS, TOKEN_COLOURS, TOKEN_SHAPES } from "./geometry";

const AVATAR = 34;

export function TokenBadge({ seat, size = 14 }: { seat: number; size?: number }) {
  const shape = TOKEN_SHAPES[seat % 8] as keyof typeof SHAPE_PATHS;
  return (
    <svg viewBox="-1.3 -1.3 2.6 2.6" width={size} height={size} aria-hidden="true">
      <path d={SHAPE_PATHS[shape]} fill={TOKEN_COLOURS[seat % 8]} stroke="#fff" strokeWidth="0.2" />
    </svg>
  );
}

type Player = {
  seat: number;
  info: SeatPublic;
  square: number;
  place: string | undefined;
  active: boolean;
  clock: { endsAt: number; totalMs: number } | null;
};

/** Everyone at the table, in a compact grid (up to 4 per row, never cut off). */
export function PlayersRow({
  players,
  seats,
  me,
  offset,
}: {
  players: Player[];
  seats: SeatPublic[];
  me: number | null;
  offset: number;
}) {
  const cols = Math.min(4, players.length);
  return (
    <ul
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      aria-label="Players"
    >
      {players.map((p) => {
        const away = p.info.status === "away";
        const covered = p.info.status === "bot" && !!p.info.userId;
        const name =
          p.seat === me ? "You" : seatName(seats, p.seat).replace(/ \((Easy|Medium|Hard)\)$/, "");
        return (
          <li
            key={p.seat}
            className={`flex min-w-0 items-center gap-1 rounded-control border bg-surface px-1 py-0.5 transition-colors duration-(--dur-turn) ${p.active ? "border-accent" : "border-line"}`}
            aria-label={`${seatName(seats, p.seat)}: ${p.place ? `finished ${p.place}` : p.square ? `square ${p.square}` : "not started"}${p.active ? ", playing now" : ""}`}
          >
            <div
              className="relative shrink-0"
              style={{ width: AVATAR, height: AVATAR }}
              aria-hidden="true"
            >
              <div className={`absolute inset-[3px] ${away ? "opacity-40 grayscale" : ""}`}>
                {p.info.userId ? (
                  <Avatar username={p.info.name || "?"} image={p.info.avatar} size={AVATAR - 6} />
                ) : (
                  <span className="flex size-full items-center justify-center rounded-full bg-surface-2 text-ink-2">
                    <Bot size={15} />
                  </span>
                )}
              </div>
              {p.active && p.clock ? (
                <TimerRing key={p.clock.endsAt} {...p.clock} offset={offset} size={AVATAR} />
              ) : p.active ? (
                <ThinkingRing size={AVATAR} />
              ) : null}
              <span className="absolute -right-1 -bottom-1 rounded-full bg-surface p-px">
                <TokenBadge seat={p.seat} />
              </span>
              {away || covered ? (
                <span className="absolute -top-1 -right-1 rounded-full bg-surface p-px text-ink-2">
                  {away ? <WifiOff size={11} /> : <Bot size={11} />}
                </span>
              ) : null}
            </div>
            <div className="min-w-0" aria-hidden="true">
              <p
                className={`truncate text-[11px] leading-tight ${p.active ? "font-bold" : "font-semibold"}`}
              >
                {name}
              </p>
              <p className="text-[11px] leading-tight whitespace-nowrap text-ink-2 tabular-nums">
                {p.place ? (
                  <span className="font-bold text-ink">{p.place}</span>
                ) : p.square ? (
                  `Sq ${p.square}`
                ) : (
                  "Start"
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
