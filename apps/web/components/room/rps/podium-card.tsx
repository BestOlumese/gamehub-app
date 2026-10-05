"use client";

import { rpsPlaceLabels, rpsPlaces, type RpsView } from "@gamehub/engine/rps";
import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Bot, Crown } from "lucide-react";
import Link from "next/link";
import { seatName } from "./names";

function Face({ seats, seat, size }: { seats: SeatPublic[]; seat: number; size: number }) {
  const s = seats[seat];
  if (s && !s.userId) {
    return (
      <span
        className="flex items-center justify-center rounded-full bg-surface-2 text-ink-2"
        style={{ width: size, height: size }}
      >
        <Bot size={size / 2} aria-hidden="true" />
      </span>
    );
  }
  return <Avatar username={s?.name || "?"} image={s?.avatar} size={size} />;
}

type Props = {
  view: RpsView;
  seats: SeatPublic[];
  you: number | "spectator";
  onRematch: () => void;
};

/** Podium for knockouts; a score card for duels. Slides up over the final screen. */
export function PodiumCard({ view, seats, you, onRematch }: Props) {
  const places = rpsPlaces(view);
  const labels = rpsPlaceLabels(places);
  const champ = view.champion ?? 0;
  const duel = view.players === 2;
  const title =
    champ === you
      ? duel
        ? "You won!"
        : "You're the champion!"
      : duel
        ? `${seatName(seats, champ)} won`
        : `${seatName(seats, champ)} is the champion`;
  const final = view.rounds.at(-1)?.[0];

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:pb-8">
      <div
        role="dialog"
        aria-labelledby="podium-title"
        className="mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-lg transition-[translate,opacity] duration-(--dur-sheet) ease-standard starting:translate-y-full starting:opacity-0"
      >
        <h2
          id="podium-title"
          className="text-center font-display text-2xl font-extrabold tracking-tight"
        >
          {title}
        </h2>

        {duel && final ? (
          <div className="mt-5 flex items-center justify-center gap-6">
            {[final.a, final.b].map((seat, i) =>
              seat === null ? null : (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <Face seats={seats} seat={seat} size={52} />
                  <span className="max-w-[7rem] truncate text-sm font-semibold">
                    {seatName(seats, seat)}
                  </span>
                  <span className="font-display text-3xl font-extrabold tabular-nums">
                    {final.score[i]}
                  </span>
                </div>
              ),
            )}
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-3 items-end gap-2 text-center">
              {[1, 0, 2].map((p) => {
                const group = places[p] ?? [];
                const heights = ["h-20", "h-14", "h-10"];
                return (
                  <div key={p} className="flex flex-col items-center gap-1.5">
                    {p === 0 ? (
                      <Crown size={22} className="text-accent" aria-hidden="true" />
                    ) : null}
                    <div className="flex -space-x-2">
                      {group.map((seat) => (
                        <span key={seat} className="rounded-full ring-2 ring-surface">
                          <Face seats={seats} seat={seat} size={p === 0 ? 52 : 40} />
                        </span>
                      ))}
                    </div>
                    <span className="max-w-full truncate text-xs font-semibold">
                      {group.map((seat) => seatName(seats, seat)).join(", ")}
                    </span>
                    <div
                      className={`flex w-full items-start justify-center rounded-t-control pt-1 text-sm font-bold ${heights[p]} ${p === 0 ? "bg-accent" : "bg-surface-2"}`}
                    >
                      {group[0] !== undefined ? labels.get(group[0]) : ""}
                    </div>
                  </div>
                );
              })}
            </div>
            {places.length > 3 ? (
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                {places.slice(3).map((group) => (
                  <li key={group[0]} className="flex gap-2">
                    <span className="w-20 shrink-0 text-ink-2">
                      {group[0] !== undefined ? labels.get(group[0]) : ""}
                    </span>
                    <span className="font-semibold">
                      {group.map((seat) => seatName(seats, seat)).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}

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
