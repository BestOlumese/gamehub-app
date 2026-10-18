"use client";

import { ResultShell } from "../result-shell";
import { naira, netWorth, type PlotsRules, type PlotsView } from "@gamehub/engine/plots";
import type { SeatPublic } from "@gamehub/protocol";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import Link from "next/link";
import { placeLabels } from "../places";
import { seatName } from "../rps/names";
import { Token } from "./tokens";
import { RematchLabel } from "../rematch-label";

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
    <ResultShell
      game="plots"
      labelId="plots-result"
      title={<>{winner === me ? "You won!" : `${seatName(seats, winner ?? 0)} won`}</>}
      winner={winner ?? null}
      places={places}
      seats={seats}
    >
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
            <RematchLabel />
          </Button>
        ) : null}
        <Link href="/home" className={buttonClasses("ghost", "lg", "w-full")}>
          Back home
        </Link>
      </div>
    </ResultShell>
  );
}
