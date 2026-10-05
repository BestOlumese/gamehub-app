"use client";

import type { WhotView } from "@gamehub/engine/whot";
import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Bot, Crown } from "lucide-react";
import Link from "next/link";
import { seatName } from "../rps/names";

const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

/** Place labels; seats that tie share one ("=2nd"). */
export function placeLabels(places: number[][]) {
  const out = new Map<number, string>();
  let at = 0;
  for (const group of places) {
    for (const seat of group) out.set(seat, `${group.length > 1 ? "=" : ""}${ORD[at] ?? ""}`);
    at += group.length;
  }
  return out;
}

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
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:pb-8">
      <div
        role="dialog"
        aria-labelledby="whot-result"
        className="mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-lg transition-[translate,opacity] duration-(--dur-sheet) ease-standard starting:translate-y-full starting:opacity-0"
      >
        <h2
          id="whot-result"
          className="text-center font-display text-2xl font-extrabold tracking-tight"
        >
          {title}
        </h2>
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
              Rematch
            </Button>
          ) : null}
          <Link href="/home" className={buttonClasses("secondary", "lg", "w-full")}>
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
