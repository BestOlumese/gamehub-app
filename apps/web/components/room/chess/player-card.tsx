"use client";

import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Bot, WifiOff } from "lucide-react";
import { mmss, useNow } from "../use-now";

/** Clock text: m:ss, then seconds and tenths for the last 10 seconds ("9.4"). */
export const clockText = (ms: number) =>
  ms < 10_000 ? (Math.floor(Math.max(0, ms) / 100) / 10).toFixed(1) : mmss(ms);

type Props = {
  seat: SeatPublic;
  isYou: boolean;
  /** "w" or "b": a small disc so you can tell the colours apart. */
  colour: "w" | "b";
  /** Pieces this player has taken, as codes ("q", "p", …), and their material lead. */
  captured: string[];
  lead: number;
  /** Remaining ms now (null: no clock), and whether it's running. */
  clock: { ms: number; running: boolean } | null;
  /** On the move without a clock (No clock games, or bots before the clocks start). */
  toMove: boolean;
  graceEndsAt?: number | undefined;
  offset: number;
};

/** A player above or below the board: who, what they've taken, and their clock. */
export function PlayerCard({
  seat,
  isYou,
  colour,
  captured,
  lead,
  clock,
  toMove,
  graceEndsAt,
  offset,
}: Props) {
  const now = useNow(!!graceEndsAt) + offset;
  const label = seat.userId ? `@${seat.name}` : seat.name;
  const away = seat.status === "away";
  const low = !!clock && clock.ms < 10_000;
  const theirs = colour === "w" ? "b" : "w"; // they captured the other colour's pieces
  return (
    <div
      className={`flex items-center gap-3 rounded-card border bg-surface px-3 py-2 shadow-sm transition-colors duration-(--dur-turn) ${toMove ? "border-accent" : "border-line"}`}
    >
      <div className={`relative shrink-0 ${away ? "opacity-40 grayscale" : ""}`}>
        {seat.userId ? (
          <Avatar username={seat.name || "?"} image={seat.avatar} size={36} />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2">
            <Bot size={18} aria-hidden="true" />
          </span>
        )}
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-surface ${colour === "w" ? "bg-[#F2E6D0] ring-1 ring-ink-3" : "bg-ink"}`}
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
          <span className="truncate">{label}</span>
          {isYou ? <span className="text-xs text-ink-2">(you)</span> : null}
        </p>
        <div
          className="flex h-5 items-center gap-1 text-xs text-ink-2"
          aria-label={
            captured.length
              ? `Captured: ${captured.length} pieces${lead ? `, ahead by ${lead}` : ""}`
              : undefined
          }
        >
          {away && graceEndsAt ? (
            <span className="inline-flex items-center gap-1">
              <WifiOff size={12} aria-hidden="true" /> Offline ({mmss(graceEndsAt - now)})
            </span>
          ) : seat.status === "bot" && seat.userId ? (
            <span className="inline-flex items-center gap-1">
              <Bot size={12} aria-hidden="true" /> A bot is playing for them
            </span>
          ) : (
            <>
              <span className="flex -space-x-1.5" aria-hidden="true">
                {captured.map((p, i) => (
                  <svg key={i} viewBox="0 0 45 45" className="size-4">
                    <use href={`#cp-${theirs}${p.toUpperCase()}`} />
                  </svg>
                ))}
              </span>
              {lead > 0 ? <span className="font-semibold text-ink">+{lead}</span> : null}
            </>
          )}
        </div>
      </div>
      {clock ? (
        <span
          className={`min-w-20 rounded-control px-2.5 py-1 text-right font-display text-2xl font-bold tabular-nums transition-colors duration-(--dur-turn) ${low && clock.running ? "bg-danger-soft text-danger-strong" : clock.running ? "bg-accent text-ink" : "bg-surface-2 text-ink-2"}`}
          aria-label={`${isYou ? "Your" : `${label}'s`} clock: ${mmss(clock.ms)}`}
        >
          {clockText(clock.ms)}
        </span>
      ) : null}
    </div>
  );
}
