"use client";

import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Bot, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { seatName } from "../rps/names";
import { ThinkingRing, TimerRing } from "../timer-ring";
import { mmss, useNow } from "../use-now";

const AVATAR = 44;

type Props = {
  seat: SeatPublic;
  index: number;
  seats: SeatPublic[];
  colour: string;
  isYou: boolean;
  active: boolean;
  clock: { endsAt: number; totalMs: number } | null;
  offset: number;
  home: number;
  place: string | undefined;
  graceEndsAt: number | undefined;
  /** Right-hand corners mirror the layout so the die sits towards the middle. */
  mirror: boolean;
  die: ReactNode;
};

/** A player's corner panel: avatar (timer or thinking ring on their turn), name, seeds home, die. */
export function Panel({
  seat,
  index,
  seats,
  colour,
  isYou,
  active,
  clock,
  offset,
  home,
  place,
  graceEndsAt,
  mirror,
  die,
}: Props) {
  const away = seat.status === "away";
  const covered = seat.status === "bot" && !!seat.userId;
  const now = useNow(away && !!graceEndsAt) + offset;
  const name = isYou ? "You" : seatName(seats, index).replace(/ \((Easy|Medium|Hard)\)$/, "");
  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${mirror ? "flex-row-reverse text-right" : ""}`}
    >
      <div
        className={`relative shrink-0 transition-transform duration-(--dur-turn) ${active ? "scale-110" : ""}`}
        style={{ width: AVATAR, height: AVATAR }}
      >
        <div className={`absolute inset-[5px] rounded-full ${away ? "opacity-40 grayscale" : ""}`}>
          {seat.userId ? (
            <Avatar username={seat.name || "?"} image={seat.avatar} size={AVATAR - 10} />
          ) : (
            <span className="flex size-full items-center justify-center rounded-full bg-surface-2 text-ink-2">
              <Bot size={18} aria-hidden="true" />
            </span>
          )}
        </div>
        {active && clock ? (
          <TimerRing key={clock.endsAt} {...clock} offset={offset} size={AVATAR} />
        ) : active ? (
          <ThinkingRing size={AVATAR} />
        ) : null}
        <span
          className="absolute -bottom-0.5 left-1/2 size-3 -translate-x-1/2 rounded-full ring-2 ring-paper"
          style={{ background: colour }}
          aria-hidden="true"
        />
        {away || covered ? (
          <span className="absolute -top-1 -right-1 rounded-full bg-surface p-0.5 text-ink-2 shadow-sm">
            {away ? <WifiOff size={12} aria-hidden="true" /> : <Bot size={12} aria-hidden="true" />}
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        <p
          className={`truncate rounded-full text-sm ${active ? "bg-accent px-2 font-bold text-ink" : "font-semibold"}`}
        >
          {name}
        </p>
        <p className="text-xs text-ink-2 tabular-nums">
          {place ? (
            <span className="font-bold text-ink">{place}</span>
          ) : away ? (
            `Offline${graceEndsAt ? ` ${mmss(graceEndsAt - now)}` : ""}`
          ) : covered ? (
            "Bot playing"
          ) : (
            `${home}/4 home`
          )}
        </p>
      </div>
      <div className="shrink-0">{die}</div>
    </div>
  );
}
