"use client";

import type { TttState } from "@gamehub/engine";
import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Button } from "@gamehub/ui/forms/button";
import Link from "next/link";
import { buttonClasses } from "@gamehub/ui/forms/button";

type Props = {
  state: TttState;
  seats: SeatPublic[];
  you: number | "spectator";
  onRematch: () => void;
};

const who = (s: SeatPublic | undefined) => (s ? (s.userId ? `@${s.name}` : s.name) : "?");

/** Slides up over the final board. */
export function ResultCard({ state, seats, you, onRematch }: Props) {
  const w = state.seriesWinner;
  const title = w === "draw" ? "It's a draw" : w === you ? "You won!" : `${who(seats[w ?? 0])} won`;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:pb-8">
      <div
        role="dialog"
        aria-labelledby="result-title"
        className="mx-auto max-w-md rounded-card border border-line bg-surface p-6 shadow-lg transition-[translate,opacity] duration-(--dur-sheet) ease-standard starting:translate-y-full starting:opacity-0"
      >
        <h2
          id="result-title"
          className="text-center font-display text-3xl font-extrabold tracking-tight"
        >
          {title}
        </h2>
        <div className="mt-5 flex items-center justify-center gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <Avatar username={seats[i]?.name || "?"} image={seats[i]?.avatar} size={48} />
              <span className="max-w-[7rem] truncate text-sm font-semibold">{who(seats[i])}</span>
              <span className="font-display text-3xl font-extrabold tabular-nums">
                {state.score[i]}
              </span>
            </div>
          ))}
        </div>
        {state.draws ? (
          <p className="mt-2 text-center text-sm text-ink-2">
            {state.draws} drawn {state.draws === 1 ? "round" : "rounds"}
          </p>
        ) : null}
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
