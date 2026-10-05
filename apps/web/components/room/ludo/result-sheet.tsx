"use client";

import { HOME, type Colour, type LudoState } from "@gamehub/engine/ludo";
import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Bot, Crown } from "lucide-react";
import Link from "next/link";
import { placeLabels } from "../places";
import { seatName } from "../rps/names";
import { COLOUR_HEX } from "./geometry";

type Props = {
  view: LudoState;
  seats: SeatPublic[];
  you: number | "spectator";
  onRematch: () => void;
};

/** Slides up when the game ends: every place, with seeds home. */
export function LudoResult({ view, seats, you, onRematch }: Props) {
  const places = view.places ?? [];
  const labels = placeLabels(places);
  const winners = places[0] ?? [];
  const title = winners.includes(you as number)
    ? "You won!"
    : `${winners.map((s) => seatName(seats, s)).join(" & ")} won`;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:pb-8">
      <div
        role="dialog"
        aria-labelledby="ludo-result"
        className="mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-lg transition-[translate,opacity] duration-(--dur-sheet) ease-standard starting:translate-y-full starting:opacity-0"
      >
        <h2
          id="ludo-result"
          className="text-center font-display text-2xl font-extrabold tracking-tight"
        >
          {title}
        </h2>
        <ol className="mt-5 divide-y divide-line rounded-card border border-line">
          {places.flat().map((seat) => {
            const s = seats[seat];
            const home = (view.seeds[seat] ?? []).filter((p) => p === HOME).length;
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
                  <span
                    className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-surface"
                    style={{ background: COLOUR_HEX[view.colours[seat] as Colour] }}
                    aria-hidden="true"
                  />
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-semibold">
                  <span className="truncate">{seatName(seats, seat)}</span>
                  {seat === you ? <span className="text-xs text-ink-2">(you)</span> : null}
                  {winners.includes(seat) ? (
                    <Crown size={15} className="shrink-0 text-accent" aria-label="Winner" />
                  ) : null}
                </span>
                <span className="text-sm text-ink-2 tabular-nums">{home}/4 home</span>
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
