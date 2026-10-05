// Browser-safe Rock Paper Scissors helpers (no zod). The full GameDefinition is in ./index.ts.
import type { SeatIndex } from "../../types";
import {
  isLive,
  matchOf,
  THROWS,
  type MatchView,
  type RpsAction,
  type RpsState,
  type RpsView,
} from "./state";

export function rpsLegalActions(s: RpsState, seat: SeatIndex): RpsAction[] {
  if (s.over) return [];
  const m = matchOf(s.rounds, s.round, seat);
  if (!m || !isLive(m) || m.picks[seat] !== undefined) return [];
  return THROWS.map((pick) => ({ type: "throw", pick }));
}

/** The live match a seat is playing in the viewer's projection, if any. */
export function rpsMyMatch(v: RpsView, seat: SeatIndex): MatchView | undefined {
  return v.rounds[v.round]?.find((m) => m.a === seat || m.b === seat);
}

/** Places from a bracket: champion first, then losers grouped by the round they went out in. */
export function rpsPlaces(
  s: Pick<RpsState, "champion" | "eliminated"> & { rounds: readonly unknown[] },
): SeatIndex[][] {
  const places: SeatIndex[][] = s.champion !== null ? [[s.champion]] : [];
  for (let r = s.rounds.length - 1; r >= 0; r--) {
    const out = s.eliminated.filter((e) => e.round === r).map((e) => e.seat);
    if (out.length) places.push(out);
  }
  return places;
}

/** "1st", "2nd", "joint 3rd" for each seat. */
export function rpsPlaceLabels(places: SeatIndex[][]): Map<SeatIndex, string> {
  const labels = new Map<SeatIndex, string>();
  let position = 1;
  for (const group of places) {
    const ord =
      position === 1 ? "1st" : position === 2 ? "2nd" : position === 3 ? "3rd" : `${position}th`;
    for (const seat of group) labels.set(seat, group.length > 1 ? `joint ${ord}` : ord);
    position += group.length;
  }
  return labels;
}

export const roundName = (roundIndex: number, totalRounds: number) => {
  const fromEnd = totalRounds - 1 - roundIndex;
  return fromEnd === 0
    ? "Final"
    : fromEnd === 1
      ? "Semi-finals"
      : fromEnd === 2
        ? "Quarter-finals"
        : `Round ${roundIndex + 1}`;
};

export { rpsNaija, type RpsRules } from "./rules";
export { BEATS, COUNTER, THROWS } from "./state";
export type { Match, MatchView, Reveal, RpsAction, RpsState, RpsView, Throw } from "./state";
