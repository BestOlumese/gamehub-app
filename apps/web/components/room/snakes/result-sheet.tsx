"use client";

import { ResultShell } from "../result-shell";
import type { SnakesState } from "@gamehub/engine/snakes";
import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Bot, Crown } from "lucide-react";
import Link from "next/link";
import { placeLabels } from "../places";
import { seatName } from "../rps/names";
import { TokenBadge } from "./players-row";
import { RematchLabel } from "../rematch-label";

type Props = {
  view: SnakesState;
  seats: SeatPublic[];
  you: number | "spectator";
  onRematch: () => void;
};

/** Slides up when the game ends: every place, with each player's final square. */
export function SnakesResult({ view, seats, you, onRematch }: Props) {
  const places = view.places ?? [];
  const labels = placeLabels(places);
  const winners = places[0] ?? [];
  const title = winners.includes(you as number)
    ? "You won!"
    : `${winners.map((s) => seatName(seats, s)).join(" & ")} won`;
  return (
    <ResultShell
      game="snakes"
      labelId="snakes-result"
      title={title}
      winner={winners[0] ?? null}
      places={places}
      seats={seats}
    >
      <ol className="mt-5 divide-y divide-line rounded-card border border-line">
        {places.flat().map((seat) => {
          const s = seats[seat];
          return (
            <li key={seat} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-9 text-sm font-bold text-ink-2">{labels.get(seat)}</span>
              <span className="relative">
                {s && !s.userId ? (
                  <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                    <Bot size={16} aria-hidden="true" />
                  </span>
                ) : (
                  <Avatar username={s?.name || "?"} image={s?.avatar} size={32} />
                )}
                <span className="absolute -right-1 -bottom-1 rounded-full bg-surface p-px">
                  <TokenBadge seat={seat} />
                </span>
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-semibold">
                <span className="truncate">{seatName(seats, seat)}</span>
                {seat === you ? <span className="text-xs text-ink-2">(you)</span> : null}
                {winners.includes(seat) ? (
                  <Crown size={15} className="shrink-0 text-accent" aria-label="Winner" />
                ) : null}
              </span>
              <span className="text-sm text-ink-2 tabular-nums">
                {view.pos[seat] === 100 ? "Home" : `Square ${view.pos[seat] ?? 0}`}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-6 grid gap-2">
        {you !== "spectator" ? (
          <Button block onClick={onRematch}>
            <RematchLabel />
          </Button>
        ) : null}
        <Link href="/home" className={buttonClasses("secondary", "lg", "w-full")}>
          Back home
        </Link>
      </div>
    </ResultShell>
  );
}
