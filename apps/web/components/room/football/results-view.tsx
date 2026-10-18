"use client";

import type { FixtureView, FootballView, Team } from "@gamehub/engine/football";
import type { SeatPublic } from "@gamehub/protocol";
import { Button } from "@gamehub/ui/forms/button";
import { seatName } from "../rps/names";
import { TEAM_COLOURS } from "./look";
import { MatchReport } from "./match-report";
import { ResultHeader } from "../result-shell";

export const teamName = (seats: SeatPublic[], t: Team | "bye", botNames: string) =>
  t === "bye" ? "Bye" : "seat" in t ? seatName(seats, t.seat) : botNames;

/** The end: league table, knockout path, series or solo run, then Rematch. */
export function ResultsView({
  view,
  seats,
  me,
  onRematch,
}: {
  view: FootballView;
  seats: SeatPublic[];
  me: number | null;
  onRematch: () => void;
}) {
  const champ = view.places?.[0] ?? [];
  const title =
    view.mode === "solo"
      ? `Your run: ${view.rounds.filter((r) => r[0]?.result?.winner === 0).length} of 4 wins`
      : champ.length === 1
        ? champ[0] === me
          ? "You won"
          : `${seatName(seats, champ[0] as number)} won`
        : "A draw";
  return (
    <div className="tone-football flex flex-col gap-4">
      <ResultHeader
        title={title}
        winner={view.mode !== "solo" && champ.length === 1 ? (champ[0] ?? null) : null}
        seats={seats}
        className="rounded-card"
      />
      {view.mode === "league" ? (
        <table className="w-full text-sm tabular-nums">
          <thead className="text-ink-2">
            <tr>
              <th className="text-left font-semibold">Manager</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {(view.places ?? []).flat().map((seat) => {
              const r = view.table.find((x) => x.seat === seat);
              if (!r) return null;
              return (
                <tr key={seat} className={`border-t border-line ${seat === me ? "font-bold" : ""}`}>
                  <td className="py-1.5">{seatName(seats, seat)}</td>
                  <td className="text-center">{r.p}</td>
                  <td className="text-center">{r.w}</td>
                  <td className="text-center">{r.d}</td>
                  <td className="text-center">{r.l}</td>
                  <td className="text-center">{r.gf - r.ga}</td>
                  <td className="text-center font-bold">{r.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      <ol className="space-y-3">
        {view.rounds.map((round, r) => (
          <li key={r}>
            <p className="mb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
              {view.mode === "solo"
                ? `Match ${r + 1}`
                : view.mode === "league"
                  ? `Round ${r + 1}`
                  : view.mode === "knockout"
                    ? `Round ${r + 1}`
                    : `Game ${r + 1}`}
            </p>
            <ul className="divide-y divide-line tile">
              {round.map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-right">
                    {teamName(seats, f.a, f.names[0])}
                  </span>
                  <span className="font-bold tabular-nums">
                    {f.b === "bye"
                      ? "bye"
                      : f.result
                        ? `${f.result.score[0]}–${f.result.score[1]}`
                        : "–"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {f.b === "bye" ? "" : teamName(seats, f.b, f.names[1])}
                  </span>
                  {f.result?.pens ? (
                    <span className="text-xs text-ink-2">
                      (pens {f.result.pens[0]}–{f.result.pens[1]})
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <LastReport view={view} seats={seats} me={me} />
      <Button block onClick={onRematch}>
        Play again
      </Button>
    </div>
  );
}

/** Your side in a fixture, or null. */
export const sideIn = (f: FixtureView, me: number | null): 0 | 1 | null =>
  me === null
    ? null
    : "seat" in f.a && f.a.seat === me
      ? 0
      : f.b !== "bye" && "seat" in f.b && f.b.seat === me
        ? 1
        : null;

/** The report of your most recent finished match (sent in full once it's over). */
export function LastReport({
  view,
  seats,
  me,
}: {
  view: FootballView;
  seats: SeatPublic[];
  me: number | null;
}) {
  const f = view.rounds
    .flat()
    .filter((x) => x.result && x.teams && x.log.length && sideIn(x, me) !== null)
    .at(-1);
  if (!f) return null;
  return (
    <MatchReport
      fixture={f}
      side={sideIn(f, me) ?? 0}
      names={[teamName(seats, f.a, f.names[0]), teamName(seats, f.b, f.names[1])]}
      cards={view.cards}
      colours={TEAM_COLOURS}
    />
  );
}
