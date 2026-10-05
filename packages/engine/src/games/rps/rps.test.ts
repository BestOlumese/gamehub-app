import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import type { SeatIndex } from "../../types";
import { rps, type RpsRules } from "./index";
import { THROWS, type RpsState, type Throw } from "./state";

const rules = (r: Partial<RpsRules> = {}): RpsRules => ({ ...rps.presets.naija, ...r });
const ctx = (r: RpsRules, seed = "seed") => ({ rng: seededRng(seed), rules: r, now: 0 });

function throwAs(s: RpsState, seat: SeatIndex, pick: Throw, r: RpsRules, seed = "t"): RpsState {
  const res = rps.apply(s, { seat, action: { type: "throw", pick } }, ctx(r, seed));
  if (!res.ok) throw new Error(`${seat} ${pick}: ${res.error}`);
  return res.state;
}

describe("rps duel", () => {
  it("best of 3: first to two throws wins", () => {
    const r = rules();
    let s = rps.setup(2, ctx(r));
    const [a, b] = [s.rounds[0]![0]!.a!, s.rounds[0]![0]!.b!];
    s = throwAs(s, a, "rock", r);
    expect(s.rounds[0]![0]!.history).toHaveLength(0); // waiting for b
    s = throwAs(s, b, "scissors", r);
    expect(s.rounds[0]![0]!.score).toEqual([1, 0]);
    s = throwAs(throwAs(s, a, "paper", r), b, "rock", r);
    expect(s.over).toBe(true);
    expect(s.champion).toBe(a);
    expect(rps.ranking(s)).toEqual([[a], [b]]);
  });

  it("refuses a second throw before the reveal and throws from outsiders", () => {
    const r = rules();
    let s = rps.setup(2, ctx(r));
    const a = s.rounds[0]![0]!.a!;
    s = throwAs(s, a, "rock", r);
    expect(rps.apply(s, { seat: a, action: { type: "throw", pick: "paper" } }, ctx(r))).toEqual({
      ok: false,
      error: "ALREADY_THREW",
    });
    expect(rps.apply(s, { seat: 5, action: { type: "throw", pick: "rock" } }, ctx(r))).toEqual({
      ok: false,
      error: "NOT_YOUR_TURN",
    });
  });

  it("ties don't score; too many ties in a row go to a coin flip", () => {
    const r = rules({ maxTiesPerRound: 2, bestOf: 1 });
    let s = rps.setup(2, ctx(r));
    const [a, b] = [s.rounds[0]![0]!.a!, s.rounds[0]![0]!.b!];
    s = throwAs(throwAs(s, a, "rock", r), b, "rock", r);
    expect(s.rounds[0]![0]!).toMatchObject({ score: [0, 0], ties: 1 });
    s = throwAs(throwAs(s, a, "paper", r), b, "paper", r);
    const last = s.rounds[0]![0]!.history.at(-1)!;
    expect(last.coin).toBe(true);
    expect(last.result).not.toBe("tie");
    expect(s.over).toBe(true);
  });
});

describe("rps bracket", () => {
  it.each([
    [3, 4, 1],
    [5, 8, 3],
    [8, 8, 0],
  ])("%i players: bracket of %i with %i byes, every seat placed once", (players, size, byes) => {
    const s = rps.setup(players, ctx(rules()));
    const first = s.rounds[0]!;
    expect(first).toHaveLength(size / 2);
    const seats = first.flatMap((m) => [m.a, m.b]).filter((x) => x !== null);
    expect([...seats].sort()).toEqual(Array.from({ length: players }, (_, i) => i));
    expect(first.filter((m) => m.a === null || m.b === null)).toHaveLength(byes);
    // Byes are already decided; nobody plays two at once.
    for (const m of first) if (m.a === null || m.b === null) expect(m.winner).not.toBeNull();
  });

  it("8 players finish with 1st, 2nd, joint 3rd and joint 5th", () => {
    const r = rules({ bestOf: 1 });
    let s = rps.setup(8, ctx(r));
    // Seat a always throws rock and b scissors: a wins every match.
    while (!s.over) {
      for (const m of s.rounds[s.round]!) {
        if (m.winner !== null) continue;
        s = throwAs(throwAs(s, m.a!, "rock", r), m.b!, "scissors", r);
      }
    }
    const places = rps.ranking(s);
    expect(places.map((p) => p.length)).toEqual([1, 1, 2, 4]);
    expect(places.flat().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

// ── Properties ───────────────────────────────────────────────────────────────

const rulesArb = fc.record({
  turnSeconds: fc.integer({ min: 10, max: 120 }),
  bestOf: fc.constantFrom(1 as const, 3 as const, 5 as const),
  maxTiesPerRound: fc.integer({ min: 1, max: 10 }),
});
const seedArb = fc.string({ minLength: 1, maxLength: 16 });
const playersArb = fc.integer({ min: 2, max: 8 });

/** Random tournament; `onStep` sees every intermediate state. */
function play(players: number, r: RpsRules, seed: string, onStep?: (s: RpsState) => void) {
  const rng = seededRng(seed);
  let s = rps.setup(players, { rng, rules: r, now: 0 });
  let steps = 0;
  while (!rps.isOver(s)) {
    if (steps++ > 500) throw new Error("did not terminate");
    const current = rps.currentSeats(s);
    const seat = current[rng.int(current.length)]!;
    const res = rps.apply(
      s,
      { seat, action: { type: "throw", pick: THROWS[rng.int(3)]! } },
      { rng, rules: r, now: 0 },
    );
    if (!res.ok) throw new Error(`legal throw rejected: ${res.error}`);
    s = res.state;
    onStep?.(s);
  }
  return { s, steps };
}

describe("rps properties", () => {
  test.prop([playersArb, rulesArb, seedArb], { numRuns: 1000 })(
    "tournaments end within 500 throws and place every seat exactly once",
    (players, r, seed) => {
      const { s } = play(players, r, seed);
      expect(s.champion).not.toBeNull();
      expect(
        rps
          .ranking(s)
          .flat()
          .sort((x, y) => x - y),
      ).toEqual(Array.from({ length: players }, (_, i) => i));
    },
  );

  test.prop([playersArb, rulesArb, seedArb], { numRuns: 200 })(
    "no view ever shows another player's pending pick",
    (players, r, seed) => {
      play(players, r, seed, (s) => {
        for (const viewer of [
          ...Array.from({ length: players }, (_, i) => i),
          "spectator" as const,
        ]) {
          const v = rps.view(s, viewer);
          v.rounds.forEach((round, ri) =>
            round.forEach((mv, mi) => {
              const m = s.rounds[ri]![mi]!;
              // Plain checks: expect() on every step of every game is too slow.
              if ("picks" in mv) throw new Error(`${String(viewer)} sees picks`);
              const own = viewer === "spectator" ? undefined : m.picks[viewer];
              if (mv.mine !== own) throw new Error(`${String(viewer)} sees the wrong pick`);
              const thrown = [...mv.thrown].sort().join();
              if (thrown !== Object.keys(m.picks).map(Number).sort().join())
                throw new Error("thrown list doesn't match the picks");
            }),
          );
        }
      });
    },
    60_000,
  );

  test.prop([playersArb, rulesArb, seedArb], { numRuns: 300 })(
    "same seed, same tournament",
    (players, r, seed) => {
      expect(play(players, r, seed).s).toEqual(play(players, r, seed).s);
    },
  );

  test.prop(
    [
      playersArb,
      rulesArb,
      seedArb,
      fc.constantFrom("easy" as const, "medium" as const, "hard" as const),
    ],
    {
      numRuns: 300,
    },
  )("bots and timeouts only make legal throws", (players, r, seed, level) => {
    const rng = seededRng(seed);
    let s = rps.setup(players, { rng, rules: r, now: 0 });
    while (!s.over) {
      const seat = rps.currentSeats(s)[0]!;
      const a = seat % 2 ? rps.bots[level](s, seat, r, rng) : rps.timeoutAction(s, seat, r, rng);
      expect(rps.legalActions(s, seat, r)).toContainEqual(a);
      const res = rps.apply(s, { seat, action: a }, { rng, rules: r, now: 0 });
      if (!res.ok) throw new Error(res.error);
      s = res.state;
    }
  });
});

describe("rps bots", () => {
  it("medium beats a player who always throws rock", () => {
    const r = rules({ bestOf: 5 });
    let mediumWins = 0;
    for (let g = 0; g < 200; g++) {
      const rng = seededRng(`m${g}`);
      let s = rps.setup(2, { rng, rules: r, now: 0 });
      const m0 = s.rounds[0]![0]!;
      const bot = m0.a!;
      while (!s.over) {
        for (const seat of rps.currentSeats(s)) {
          const a =
            seat === bot
              ? rps.bots.medium(s, seat, r, rng)
              : ({ type: "throw", pick: "rock" } as const);
          const res = rps.apply(s, { seat, action: a }, { rng, rules: r, now: 0 });
          if (!res.ok) throw new Error(res.error);
          s = res.state;
          if (s.over) break;
        }
      }
      if (s.champion === bot) mediumWins++;
    }
    expect(mediumWins / 200).toBeGreaterThan(0.75);
  });
});

describe("rps places", () => {
  it("labels joint places", async () => {
    const { rpsPlaceLabels } = await import("./core");
    const labels = rpsPlaceLabels([[3], [1], [0, 5], [2, 4, 6, 7]]);
    expect([labels.get(3), labels.get(1), labels.get(5), labels.get(7)]).toEqual([
      "1st",
      "2nd",
      "joint 3rd",
      "joint 5th",
    ]);
  });
});
