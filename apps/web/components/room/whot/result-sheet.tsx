"use client";

import { ResultShell } from "../result-shell";
import type { WhotView } from "@gamehub/engine/whot";
import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Bot, Crown } from "lucide-react";
import Link from "next/link";
import { placeLabels } from "../places";
import { seatName } from "../rps/names";
import { RematchLabel } from "../rematch-label";

type Props = {
  view: WhotView;
  seats: SeatPublic[];
  you: number | "spectator";
  byCount: boolean;
  onRematch: () => void;
};

/** Slides up when the game ends: places, cards left and their total. */
export function ResultSheet({ view, seats, you, byCount, onRematch }: Props) {
  const places = view.places ?? [];
  const labels = placeLabels(places);
  const winners = places[0] ?? [];
  const title = winners.includes(you as number)
    ? winners.length > 1
      ? "You tied for first"
      : "You won!"
    : `${winners.map((s) => seatName(seats, s)).join(" & ")} won`;

  return (
    <ResultShell
      game="whot"
      labelId="whot-result"
      title={title}
      winner={winners[0] ?? null}
      places={places}
      seats={seats}
    >
      {byCount ? (
        <p className="mt-1 text-center text-sm text-ink-2">Market finished. Lowest total wins.</p>
      ) : null}
      <ol className="mt-5 divide-y divide-line rounded-card border border-line">
        {places.flat().map((seat) => {
          const s = seats[seat];
          const first = winners.includes(seat);
          return (
            <li key={seat} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-9 text-sm font-bold text-ink-2">{labels.get(seat)}</span>
              {s && !s.userId ? (
                <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                  <Bot size={16} aria-hidden="true" />
                </span>
              ) : (
                <Avatar username={s?.name || "?"} image={s?.avatar} size={32} />
              )}
              <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-semibold">
                <span className="truncate">{seatName(seats, seat)}</span>
                {seat === you ? <span className="text-xs text-ink-2">(you)</span> : null}
                {first ? (
                  <Crown size={15} className="shrink-0 text-accent" aria-label="Winner" />
                ) : null}
              </span>
              <span className="text-right text-sm text-ink-2 tabular-nums">
                {view.counts[seat] ? (
                  <>
                    {view.counts[seat]} {view.counts[seat] === 1 ? "card" : "cards"}
                    {view.totals ? (
                      <span className="font-semibold text-ink"> · {view.totals[seat]}</span>
                    ) : null}
                  </>
                ) : (
                  "Out"
                )}
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
