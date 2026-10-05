"use client";

import { roundName, type MatchView } from "@gamehub/engine/rps";
import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Bot, Check } from "lucide-react";
import { useState } from "react";
import { seatName } from "./names";

/** Total rounds a bracket of this first-round size will have. */
const totalRounds = (firstRoundMatches: number) => Math.max(1, Math.log2(firstRoundMatches * 2));

function PlayerLine({
  seats,
  seat,
  score,
  won,
  live,
}: {
  seats: SeatPublic[];
  seat: number | null;
  score: number;
  won: boolean;
  live: boolean;
}) {
  const s = seat === null ? null : seats[seat];
  return (
    <div
      className={`flex items-center gap-2.5 ${won ? "font-semibold" : ""} ${!won && !live && seat !== null ? "text-ink-2" : ""}`}
    >
      {s ? (
        s.userId ? (
          <Avatar username={s.name} image={s.avatar} size={26} />
        ) : (
          <span className="flex size-[26px] items-center justify-center rounded-full bg-surface-2 text-ink-2">
            <Bot size={14} aria-hidden="true" />
          </span>
        )
      ) : (
        <span
          className="size-[26px] rounded-full border border-dashed border-line"
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{seatName(seats, seat)}</span>
      {seat !== null ? <span className="text-sm tabular-nums">{score}</span> : null}
      <span className="w-4">
        {won ? <Check size={16} className="text-brand" aria-label="won" /> : null}
      </span>
    </div>
  );
}

export function Bracket({
  rounds,
  current,
  seats,
}: {
  rounds: MatchView[][];
  current: number;
  seats: SeatPublic[];
}) {
  const total = totalRounds(rounds[0]?.length ?? 1);
  const [tab, setTab] = useState(current);
  const shown = Math.min(tab, rounds.length - 1);

  return (
    <section aria-labelledby="bracket-h">
      <h2 id="bracket-h" className="sr-only">
        Bracket
      </h2>
      <div
        className="mb-3 flex gap-1 rounded-control border border-line bg-surface-2 p-1"
        role="tablist"
      >
        {Array.from({ length: total }, (_, r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={shown === r}
            disabled={r >= rounds.length}
            onClick={() => setTab(r)}
            className={`flex-1 rounded-[7px] px-2 py-2 text-xs font-semibold sm:text-sm ${shown === r ? "bg-surface text-ink shadow-sm" : "text-ink-2"} disabled:opacity-40`}
          >
            {roundName(r, total)}
          </button>
        ))}
      </div>
      <ul className="space-y-2" role="tabpanel">
        {(rounds[shown] ?? []).map((m, i) => {
          const live = m.winner === null && m.a !== null && m.b !== null;
          const bye = m.a === null || m.b === null;
          return (
            <li key={i} className="rounded-card border border-line bg-surface p-3 shadow-sm">
              {bye ? (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold">{seatName(seats, m.a ?? m.b)}</span>
                  <span className="text-ink-2">Bye, straight through</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <PlayerLine
                    seats={seats}
                    seat={m.a}
                    score={m.score[0]}
                    won={m.winner !== null && m.winner === m.a}
                    live={live}
                  />
                  <PlayerLine
                    seats={seats}
                    seat={m.b}
                    score={m.score[1]}
                    won={m.winner !== null && m.winner === m.b}
                    live={live}
                  />
                  {live ? (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-brand">
                      <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" /> Live
                    </p>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
