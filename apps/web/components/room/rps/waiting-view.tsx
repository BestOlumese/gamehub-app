"use client";

import { roundName, type RpsView } from "@gamehub/engine/rps";
import type { SeatPublic } from "@gamehub/protocol";
import { ThrowArt } from "@gamehub/ui/art/throw-art";
import { Check } from "lucide-react";
import { Bracket } from "./bracket";
import { seatName } from "./names";

const totalRounds = (v: RpsView) => Math.max(1, Math.log2((v.rounds[0]?.length ?? 1) * 2));

/** For byes, players through to the next round, the knocked out, and spectators. */
export function WaitingView({
  view,
  me,
  seats,
}: {
  view: RpsView;
  me: number | "spectator";
  seats: SeatPublic[];
}) {
  const total = totalRounds(view);
  const current = view.rounds[view.round] ?? [];
  const live = current.filter((m) => m.winner === null && m.a !== null && m.b !== null);
  const myMatch = me === "spectator" ? undefined : current.find((m) => m.a === me || m.b === me);
  const out = me === "spectator" ? undefined : view.eliminated.find((e) => e.seat === me);
  const waitingFor = `Waiting for ${live.length} ${live.length === 1 ? "match" : "matches"}…`;

  let status: { title: string; sub?: string };
  if (view.over) status = { title: "That's the tournament", sub: "Final places are below." };
  else if (me === "spectator") status = { title: "You're watching", sub: waitingFor };
  else if (out) {
    status = {
      title: `Knocked out in the ${roundName(out.round, total).toLowerCase()}`,
      sub: "Stay and watch. Your place is set when the final ends.",
    };
  } else if (myMatch && (myMatch.a === null || myMatch.b === null))
    status = { title: "You have a bye this round", sub: waitingFor };
  else
    status = {
      title: `You're through to the ${roundName(view.round + 1, total).toLowerCase()}`,
      sub: waitingFor,
    };

  return (
    <div className="mx-auto w-full max-w-md space-y-6 px-4 py-6">
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <p className="font-display text-xl font-extrabold tracking-tight">{status.title}</p>
        {status.sub ? <p className="mt-1 text-ink-2">{status.sub}</p> : null}
      </div>

      {live.length ? (
        <section aria-labelledby="live-h">
          <h2 id="live-h" className="mb-2 px-1 text-sm font-semibold text-ink-2">
            Live now
          </h2>
          <ul className="space-y-2">
            {live.map((m, i) => {
              const last = m.history.at(-1);
              return (
                <li key={i} className="rounded-card border border-line bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    {[m.a, m.b].map((seat, side) => (
                      <div
                        key={side}
                        className={`flex min-w-0 flex-1 flex-col gap-1 ${side ? "items-end text-right" : ""}`}
                      >
                        <span className="truncate text-sm font-semibold">
                          {seatName(seats, seat)}
                        </span>
                        <span className="text-xs text-ink-2">
                          {seat !== null && m.thrown.includes(seat) ? (
                            <span className="inline-flex items-center gap-1 text-brand">
                              <Check size={12} aria-hidden="true" /> thrown
                            </span>
                          ) : (
                            "choosing…"
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-3">
                    {last ? <ThrowArt pick={last.a} className="size-9" /> : null}
                    <span className="font-display text-2xl font-extrabold tabular-nums">
                      {m.score[0]} – {m.score[1]}
                    </span>
                    {last ? <ThrowArt pick={last.b} className="size-9" /> : null}
                  </div>
                  {last ? (
                    <p className="sr-only">
                      Last throw: {last.a} against {last.b}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Bracket rounds={view.rounds} current={view.round} seats={seats} />
    </div>
  );
}
