"use client";

import { naira, netWorth, type PlotsRules, type PlotsView } from "@gamehub/engine/plots";
import type { SeatPublic } from "@gamehub/protocol";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import Link from "next/link";
import { placeLabels } from "../places";
import { seatName } from "../rps/names";
import { Token } from "./tokens";

/** Places by net worth (timed) or survival (classic), with each player's worth. */
export function PlotsResult({
  view,
  rules,
  seats,
  me,
  onRematch,
}: {
  view: PlotsView;
  rules: PlotsRules;
  seats: SeatPublic[];
  me: number | null;
  onRematch: () => void;
}) {
  const places = view.places ?? [];
  const labels = placeLabels(places);
  const winner = places[0]?.[0];
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:pb-8">
      <div
        role="dialog"
        aria-labelledby="plots-result"
        className="mx-auto max-w-md rounded-card border border-line bg-surface p-6 shadow-lg transition-[translate,opacity] duration-(--dur-sheet) ease-standard starting:translate-y-full starting:opacity-0"
      >
        <h2
          id="plots-result"
          className="text-center font-display text-2xl font-extrabold tracking-tight"
        >
          {winner === me ? "You won!" : `${seatName(seats, winner ?? 0)} won`}
        </h2>
        <p className="mt-1 text-center text-sm text-ink-2">
          {view.out.length >= view.players - 1
            ? "Everyone else went bankrupt"
            : "Richest when the time ran out"}
        </p>
        <ol className="mt-4 divide-y divide-line">
          {places.flat().map((seat) => (
            <li key={seat} className="flex items-center gap-3 py-2">
              <span className="w-8 text-sm font-bold">{labels.get(seat)}</span>
              <span className="size-6 shrink-0">
                <Token seat={seat} />
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {seat === me ? "You" : seatName(seats, seat)}
              </span>
              <span className="text-sm text-ink-2 tabular-nums">
                {view.out.includes(seat) ? "Bankrupt" : naira(netWorth(view, seat, rules))}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-5 grid gap-2">
          {me !== null ? (
            <Button block onClick={onRematch}>
              Rematch
            </Button>
          ) : null}
          <Link href="/home" className={buttonClasses("ghost", "lg", "w-full")}>
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
