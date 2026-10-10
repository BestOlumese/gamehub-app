import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { seededRng } from "../../rng";
import type { SeatIndex } from "../../types";
import { SPACES } from "./board";
import { activeSeats, plotsOf } from "./core";
import { plots, plotsNaija, type PlotsRules } from "./index";
import { checkInvariants, T0 } from "./sim";
import type { PlotsAction, PlotsState } from "./state";

/**
 * People don't play like bots: random legal actions from anyone (building and mortgaging on
 * others' turns, odd trades, sitting out auctions, letting time run out). Money, buildings and
 * decks must stay right, whoever the game waits on must have something to do, and it must end.
 */
function randomOffer(
  s: PlotsState,
  seat: SeatIndex,
  rng: ReturnType<typeof seededRng>,
): PlotsAction | null {
  const others = activeSeats(s).filter((x) => x !== seat);
  const to = others[rng.int(Math.max(1, others.length))];
  if (to === undefined) return null;
  const mine = plotsOf(s, seat);
  const theirs = plotsOf(s, to);
  const pick = (list: number[]) =>
    list.length && rng.int(2) ? [list[rng.int(list.length)] as number] : [];
  return {
    type: "offer",
    to,
    give: {
      cash: rng.int(3) ? 0 : rng.int(Math.max(1, (s.cash[seat] ?? 0) + 1)),
      plots: pick(mine),
      bail: 0,
    },
    get: {
      cash: rng.int(3) ? 0 : rng.int(Math.max(1, (s.cash[to] ?? 0) + 1)),
      plots: pick(theirs),
      bail: 0,
    },
  };
}

function fuzzGame(rules: PlotsRules, players: number, seed: string) {
  const rng = seededRng(seed);
  let now = T0;
  let s = plots.setup(players, { rng, rules, now }, rng.int(players));
  for (let step = 0; step < 4000 && !s.places; step++) {
    now += 1 + rng.int(4000);
    const waiting = plots.currentSeats(s);
    if (!waiting.length) throw new Error("nobody to act, game not over");
    for (const w of waiting)
      if (!plots.legalActions(s, w, rules).length && !s.auction)
        throw new Error(`seat ${w} is waited on but has no legal action`);
    // Mostly whoever is waited on; sometimes anyone (managing, trading, answering).
    const seat =
      rng.int(4) === 0
        ? (activeSeats(s)[rng.int(activeSeats(s).length)] as SeatIndex)
        : (waiting[rng.int(waiting.length)] as SeatIndex);
    let action: PlotsAction | null;
    const r = rng.int(20);
    if (r === 0) action = randomOffer(s, seat, rng);
    else if (r === 1) action = plots.timeoutAction(s, seat, rules, rng);
    else {
      const legal = plots.legalActions(s, seat, rules);
      action = legal.length ? (legal[rng.int(legal.length)] as PlotsAction) : null;
    }
    if (!action) continue;
    const res = plots.apply(s, { seat, action }, { rng, rules, now });
    if (!res.ok) continue; // random offers and timeouts may be refused; that's fine
    s = res.state;
    checkInvariants(s, rules);
  }
  // If it didn't end within the step budget, it must at least still be playable (checked above).
  return s;
}

test.prop(
  [fc.integer({ min: 2, max: 6 }), fc.string({ maxLength: 8 }), fc.boolean(), fc.boolean()],
  {
    numRuns: Number(process.env.FUZZ_RUNS ?? 150),
  },
)(
  "random people: money, buildings and decks stay right, and nobody gets stuck",
  (players, seed, classic, houseRules) => {
    const rules: PlotsRules = {
      ...plotsNaija,
      mode: classic ? "classic" : "timed",
      timedMinutes: 30,
      owambeJackpot: houseRules,
      doubleSalaryOnExactLanding: houseRules,
      mortgageTransferInterest: houseRules ? "on_unmortgage" : "immediate",
      bankruptTo: houseRules ? "bank" : "creditor",
      buildOnLanding: houseRules,
    };
    const s = fuzzGame(rules, players, seed);
    expect(s.cash.every((x) => x >= 0)).toBe(true);
    expect(SPACES.length).toBe(40);
  },
);
