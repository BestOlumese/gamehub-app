"use client";

import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Bot, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { TimerRing } from "./timer-ring";
import { mmss, useNow } from "./use-now";

type SeatChipProps = {
  seat: SeatPublic;
  mark?: ReactNode;
  isYou?: boolean;
  /** Turn deadline when it's this seat's move. */
  turn?: { endsAt: number; totalMs: number } | null;
  graceEndsAt?: number | undefined;
  offset: number;
  score?: number;
};

const AVATAR = 44;

export function SeatChip({ seat, mark, isYou, turn, graceEndsAt, offset, score }: SeatChipProps) {
  const now = useNow(!!turn || !!graceEndsAt) + offset;
  const away = seat.status === "away";
  const bot = seat.status === "bot" || seat.status === "left";
  const label = seat.userId ? `@${seat.name}` : seat.name;

  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: AVATAR, height: AVATAR }}>
        <div className={`absolute inset-[3px] ${away ? "opacity-40 grayscale" : ""}`}>
          {bot && !seat.userId ? (
            <span className="flex size-full items-center justify-center rounded-full bg-surface-2 text-ink-2">
              <Bot size={20} aria-hidden="true" />
            </span>
          ) : (
            <Avatar username={seat.name || "?"} image={seat.avatar} size={AVATAR - 6} />
          )}
        </div>
        {turn ? (
          <TimerRing
            key={turn.endsAt}
            endsAt={turn.endsAt}
            totalMs={turn.totalMs}
            offset={offset}
            size={AVATAR}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-semibold">
          <span className="truncate">{label}</span>
          {isYou ? <span className="text-xs font-semibold text-ink-2">(you)</span> : null}
          {mark}
        </p>
        <p className="text-sm text-ink-2" aria-live="polite">
          {away && graceEndsAt ? (
            <span className="inline-flex items-center gap-1">
              <WifiOff size={13} aria-hidden="true" /> Offline ({mmss(graceEndsAt - now)})
            </span>
          ) : seat.status === "bot" && seat.userId ? (
            <span className="inline-flex items-center gap-1">
              <Bot size={13} aria-hidden="true" /> A bot is playing for them
            </span>
          ) : seat.status === "left" ? (
            "Left the game"
          ) : turn ? (
            <span className="font-semibold text-ink tabular-nums">{mmss(turn.endsAt - now)}</span>
          ) : (
            " "
          )}
        </p>
      </div>
      {score !== undefined ? (
        <span
          className="font-display text-3xl font-extrabold tabular-nums"
          aria-label={`${score} rounds won`}
        >
          {score}
        </span>
      ) : null}
    </div>
  );
}
