import { at } from "../../at";
import type { BotLevel, Rng, SeatIndex } from "../../types";
import {
  COUNTER,
  matchOf,
  THROWS,
  type Reveal,
  type RpsAction,
  type RpsState,
  type Throw,
} from "./state";

const throwOf = (pick: Throw): RpsAction => ({ type: "throw", pick });
const random = (rng: Rng) => at(THROWS, rng.int(3));

/** Opponent's revealed throws in this match (bots never see pending picks). */
function opponentThrows(
  s: RpsState,
  seat: SeatIndex,
): { mine: Throw[]; theirs: Throw[]; last?: Reveal | undefined } {
  const m = matchOf(s.rounds, s.round, seat);
  if (!m) return { mine: [], theirs: [] };
  const meA = m.a === seat;
  return {
    mine: m.history.map((h) => (meA ? h.a : h.b)),
    theirs: m.history.map((h) => (meA ? h.b : h.a)),
    last: m.history.at(-1),
  };
}

function mostFrequent(xs: Throw[]): Throw | null {
  if (!xs.length) return null;
  const counts = new Map<Throw, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? null;
}

export function easy(_s: RpsState, _seat: SeatIndex, rng: Rng): RpsAction {
  return throwOf(random(rng));
}

/** Counters the opponent's favourite throw most of the time. */
export function medium(s: RpsState, seat: SeatIndex, rng: Rng): RpsAction {
  const fav = mostFrequent(opponentThrows(s, seat).theirs);
  if (fav && rng.int(10) < 6) return throwOf(COUNTER[fav]);
  return throwOf(random(rng));
}

/**
 * Win-stay / lose-shift model of the opponent: winners tend to repeat, losers
 * tend to switch to what would have beaten the winning throw.
 */
export function hard(s: RpsState, seat: SeatIndex, rng: Rng): RpsAction {
  const { theirs, mine, last } = opponentThrows(s, seat);
  if (rng.int(10) < 2 || !last) return medium(s, seat, rng);
  const theirLast = at(theirs, theirs.length - 1);
  const myLast = at(mine, mine.length - 1);
  const theyWon = last.result !== "tie" && last.result !== seat;
  const tie = last.result === "tie";
  let expected: Throw;
  if (tie) expected = mostFrequent(theirs) ?? theirLast;
  else if (theyWon)
    expected = theirLast; // win-stay
  else expected = COUNTER[myLast]; // lose-shift: to what beats my winning throw
  return throwOf(COUNTER[expected]);
}

export const rpsBots: Record<BotLevel, (s: RpsState, seat: SeatIndex, rng: Rng) => RpsAction> = {
  easy,
  medium,
  hard,
};
