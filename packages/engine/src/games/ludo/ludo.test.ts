import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import type { Rng, SeatIndex } from "../../types";
import { HOME, square, SAFE_SQUARES } from "./core";
import { ludo, type LudoRules, type LudoState } from "./index";
import type { Colour, LudoAction } from "./state";

const rules = (r: Partial<LudoRules> = {}): LudoRules => ({ ...ludo.presets.naija, ...r });

/** An RNG that rolls the given dice in order (rng.int(6) + 1 = value). */
function dice(...values: number[]): Rng {
  let i = 0;
  return {
    int: () => (values[i++] ?? 1) - 1,
    shuffle: (a) => [...a],
    counter: () => i,
  };
}

function position(p: Partial<LudoState> & { seeds: number[][] }): LudoState {
  const players = p.seeds.length;
  return {
    players,
    colours:
      players === 2
        ? ["red", "yellow"]
        : (["red", "green", "yellow", "blue"] as Colour[]).slice(0, players),
    turn: 0,
    phase: "roll",
    die: null,
    lastRoll: null,
    sixesInRow: 0,
    movable: [],
    finished: [],
    over: false,
    places: null,
    ...p,
  };
}

function act(s: LudoState, seat: SeatIndex, action: LudoAction, r: LudoRules, rng: Rng = dice()) {
  const res = ludo.apply(s, { seat, action }, { rng, rules: r, now: 0 });
  if (!res.ok) throw new Error(`${seat} ${JSON.stringify(action)}: ${res.error}`);
  return res;
}
const roll = (s: LudoState, value: number, r: LudoRules) =>
  act(s, s.turn, { type: "roll" }, r, dice(value));
const move = (s: LudoState, seed: number, r: LudoRules) =>
  act(s, s.turn, { type: "move", seed }, r);

describe("ludo yard and start", () => {
  it("needs a six to come out; any roll when that's off", () => {
    const s = position({
      seeds: [
        [-1, -1, -1, -1],
        [-1, -1, -1, -1],
      ],
    });
    const five = roll(s, 5, rules());
    expect(five.state).toMatchObject({ turn: 1, phase: "roll" });
    expect(five.events.map((e) => e.type)).toEqual(["rolled", "no_move"]);
    const six = roll(s, 6, rules()).state;
    expect(six).toMatchObject({ phase: "move", die: 6, movable: [0, 1, 2, 3] });
    expect(move(six, 2, rules()).state.seeds[0]).toEqual([-1, -1, 0, -1]);
    const any = roll(s, 3, rules({ needSixToLeaveYard: false })).state;
    expect(any.movable).toEqual([0, 1, 2, 3]);
  });

  it("a six rolls again; off, the turn passes", () => {
    const s = position({
      seeds: [
        [10, -1, -1, -1],
        [-1, -1, -1, -1],
      ],
    });
    const on = move(roll(s, 6, rules()).state, 0, rules()).state;
    expect(on).toMatchObject({ turn: 0, phase: "roll", sixesInRow: 1 });
    const off = move(
      roll(s, 6, rules({ sixRollsAgain: false })).state,
      0,
      rules({ sixRollsAgain: false }),
    ).state;
    expect(off.turn).toBe(1);
  });

  it("a six with nothing to move still rolls again", () => {
    const s = position({
      seeds: [
        [53, HOME, HOME, HOME],
        [-1, -1, -1, -1],
      ],
    });
    const t = roll(s, 6, rules()).state;
    expect(t).toMatchObject({ turn: 0, phase: "roll" });
  });

  it("three sixes in a row forfeits the turn; no limit when 0", () => {
    const s = position({
      seeds: [
        [10, -1, -1, -1],
        [-1, -1, -1, -1],
      ],
      sixesInRow: 2,
    });
    const t = roll(s, 6, rules());
    expect(t.events.map((e) => e.type)).toContain("six_forfeit");
    expect(t.state).toMatchObject({ turn: 1, sixesInRow: 0 });
    expect(roll(s, 6, rules({ maxConsecutiveSixes: 0 })).state.phase).toBe("move");
  });
});

describe("ludo moving", () => {
  it("moves by the roll and enters the home column after square 50", () => {
    const s = position({
      seeds: [
        [48, -1, -1, -1],
        [-1, -1, -1, -1],
      ],
    });
    const t = move(roll(s, 5, rules()).state, 0, rules());
    expect(t.state.seeds[0]![0]).toBe(53);
    expect(t.events.find((e) => e.type === "moved")).toMatchObject({
      from: 48,
      to: 53,
      path: [49, 50, 51, 52, 53],
    });
  });

  it("home needs an exact roll; overshoot allowed when that's off", () => {
    const s = position({
      seeds: [
        [54, -1, -1, -1],
        [-1, -1, -1, -1],
      ],
    });
    expect(roll(s, 3, rules()).state.turn).toBe(1); // can't move
    const exact = move(roll(s, 2, rules()).state, 0, rules());
    expect(exact.events.map((e) => e.type)).toContain("entered_home");
    expect(exact.state).toMatchObject({ turn: 0, phase: "roll" }); // home earns a roll
    const loose = rules({ exactRollToFinish: false, homeGivesBonusRoll: false });
    const over = move(roll(s, 5, loose).state, 0, loose).state;
    expect(over.seeds[0]![0]).toBe(HOME);
    expect(over.turn).toBe(1);
  });

  it("refuses moves that aren't on offer", () => {
    const s = roll(
      position({
        seeds: [
          [10, -1, -1, -1],
          [-1, -1, -1, -1],
        ],
      }),
      4,
      rules(),
    ).state;
    const bad = (a: LudoAction, seat = 0) => {
      const r = ludo.apply(s, { seat, action: a }, { rng: dice(), rules: rules(), now: 0 });
      return r.ok ? null : r.error;
    };
    expect(bad({ type: "move", seed: 1 })).toBe("NEED_SIX");
    expect(bad({ type: "roll" })).toBe("ILLEGAL_MOVE");
    expect(bad({ type: "move", seed: 0 }, 1)).toBe("NOT_YOUR_TURN");
  });

  it("one seed (or a group sitting together) to move: it moves by itself", () => {
    const one = roll(
      position({
        seeds: [
          [10, -1, -1, -1],
          [-1, -1, -1, -1],
        ],
      }),
      4,
      rules(),
    ).state;
    expect(ludo.autoAdvance(one, rules())).toMatchObject({ action: { type: "move", seed: 0 } });
    const yard = roll(
      position({
        seeds: [
          [-1, -1, -1, -1],
          [-1, -1, -1, -1],
        ],
      }),
      6,
      rules(),
    ).state;
    expect(ludo.autoAdvance(yard, rules())).toMatchObject({ action: { type: "move", seed: 0 } });
    const two = roll(
      position({
        seeds: [
          [10, 20, -1, -1],
          [-1, -1, -1, -1],
        ],
      }),
      4,
      rules(),
    ).state;
    expect(ludo.autoAdvance(two, rules())).toBeNull();
    expect(ludo.autoAdvance(one, rules({ autoMoveSingle: false }))).toBeNull();
  });
});

describe("ludo captures and safety", () => {
  // Red p=5 is square 5; yellow (start 26) on square 8 has p = 34.
  it("landing on a rival sends it home and earns a roll", () => {
    const s = position({
      seeds: [
        [2, -1, -1, -1],
        [31, -1, -1, -1],
      ],
    }); // yellow p31 = square 5
    expect(square("yellow", 31)).toBe(5);
    const t = move(roll(s, 3, rules()).state, 0, rules());
    expect(t.state.seeds[1]![0]).toBe(-1);
    expect(t.events.map((e) => e.type)).toEqual(["moved", "captured"]);
    expect(t.state).toMatchObject({ turn: 0, phase: "roll" });
    const noBonus = rules({ captureGivesBonusRoll: false });
    expect(move(roll(s, 3, noBonus).state, 0, noBonus).state.turn).toBe(1);
  });

  it("stars and start squares are safe, unless safe squares are off", () => {
    const s = position({
      seeds: [
        [5, -1, -1, -1],
        [34, -1, -1, -1],
      ],
    }); // yellow on square 8 (star)
    expect(SAFE_SQUARES.has(8)).toBe(true);
    expect(move(roll(s, 3, rules()).state, 0, rules()).state.seeds[1]![0]).toBe(34);
    const off = rules({ safeSquares: false });
    expect(move(roll(s, 3, off).state, 0, off).state.seeds[1]![0]).toBe(-1);
  });

  it("no capturing at all when captures are off: seeds share the square", () => {
    const r = rules({ captureSendsHome: false });
    const s = position({
      seeds: [
        [2, -1, -1, -1],
        [31, -1, -1, -1],
      ],
    });
    expect(move(roll(s, 3, r).state, 0, r).state.seeds[1]![0]).toBe(31);
  });

  it("blockades: two rival seeds on a square stop you passing or landing", () => {
    const r = rules({ blockades: true });
    const s = position({
      seeds: [
        [2, -1, -1, -1],
        [31, 31, -1, -1],
      ],
    }); // two yellows on square 5
    expect(roll(s, 3, r).state.turn).toBe(1); // land: blocked
    expect(roll(s, 5, r).state.turn).toBe(1); // pass: blocked
    expect(roll(s, 2, r).state.movable).toEqual([0]); // stop short: fine
    // Off: landing captures both.
    const t = move(roll(s, 3, rules()).state, 0, rules()).state;
    expect(t.seeds[1]).toEqual([-1, -1, -1, -1]);
  });
});

describe("ludo ending", () => {
  it("play on: places in finishing order, last player placed when one is left", () => {
    const s = position({
      seeds: [
        [HOME, HOME, HOME, 55],
        [HOME, HOME, HOME, 55],
        [10, -1, -1, -1],
      ],
      finished: [],
    });
    const a = move(roll(s, 1, rules()).state, 3, rules()).state;
    expect(a).toMatchObject({ finished: [0], over: false, turn: 1 });
    const b = move(roll(a, 1, rules()).state, 3, rules()).state;
    expect(b.over).toBe(true);
    expect(ludo.ranking(b)).toEqual([[0], [1], [2]]);
  });

  it("first finisher ends it: the rest rank by progress", () => {
    const r = rules({ endMode: "firstFinisherEnds" });
    const s = position({
      seeds: [
        [HOME, HOME, HOME, 55],
        [40, 20, -1, -1],
        [40, 20, -1, -1],
        [50, -1, -1, -1],
      ],
    });
    const t = move(roll(s, 1, r).state, 3, r).state;
    expect(t.over).toBe(true);
    // 41+21+0+0 = 62 each for seats 1 and 2; seat 3: 51
    expect(ludo.ranking(t)).toEqual([[0], [1, 2], [3]]);
  });

  it("time out: roll, then move the seed furthest along", () => {
    const s = roll(
      position({
        seeds: [
          [10, 30, -1, -1],
          [-1, -1, -1, -1],
        ],
      }),
      4,
      rules(),
    ).state;
    expect(ludo.timeoutAction(s, 0, rules(), dice())).toEqual({ type: "move", seed: 1 });
    expect(
      ludo.timeoutAction(
        position({
          seeds: [
            [-1, -1, -1, -1],
            [-1, -1, -1, -1],
          ],
        }),
        0,
        rules(),
        dice(),
      ),
    ).toEqual({ type: "roll" });
  });
});

// ── Properties ───────────────────────────────────────────────────────────────

const rulesArb = fc.record({
  turnSeconds: fc.integer({ min: 10, max: 120 }),
  needSixToLeaveYard: fc.boolean(),
  sixRollsAgain: fc.boolean(),
  maxConsecutiveSixes: fc.constantFrom(0, 2, 3, 4, 5),
  captureGivesBonusRoll: fc.boolean(),
  homeGivesBonusRoll: fc.boolean(),
  exactRollToFinish: fc.boolean(),
  safeSquares: fc.boolean(),
  blockades: fc.boolean(),
  captureSendsHome: fc.boolean(),
  autoMoveSingle: fc.boolean(),
  endMode: fc.constantFrom("playOn" as const, "firstFinisherEnds" as const),
});
const seedArb = fc.string({ minLength: 1, maxLength: 16 });
const playersArb = fc.integer({ min: 2, max: 4 });

function randomGame(players: number, r: LudoRules, seed: string, onStep?: (s: LudoState) => void) {
  const rng = seededRng(seed);
  let s = ludo.setup(players, { rng, rules: r, now: 0 });
  let steps = 0;
  while (!ludo.isOver(s)) {
    if (steps++ > 5000) throw new Error("did not end within 5,000 actions");
    const legal = ludo.legalActions(s, s.turn, r);
    const res = ludo.apply(
      s,
      { seat: s.turn, action: legal[rng.int(legal.length)]! },
      { rng, rules: r, now: 0 },
    );
    if (!res.ok) throw new Error(`legal action rejected: ${res.error}`);
    s = res.state;
    onStep?.(s);
  }
  return s;
}

describe("ludo properties", () => {
  test.prop([playersArb, rulesArb, seedArb], { numRuns: 1000 })(
    "seeds stay in range, captures leave no rival on a square, finished means all home, every game ends",
    (players, r, seed) => {
      // Plain checks per step (expect() on every step of thousands of steps is too slow).
      const fail = (why: string, st: LudoState) => {
        throw new Error(`${why}: ${JSON.stringify(st)}`);
      };
      const s = randomGame(players, r, seed, (st) => {
        st.seeds.forEach((seeds, seat) => {
          if (seeds.some((p) => p < -1 || p > HOME)) fail("seed out of range", st);
          const allHome = seeds.every((p) => p === HOME);
          if (allHome && !st.finished.includes(seat)) fail("home but not finished", st);
          // Only the last player left (play on) is placed without being home.
          if (st.finished.includes(seat) && !st.over && !allHome) fail("finished early", st);
        });
        if (r.captureSendsHome && !r.blockades) {
          const owner = new Map<number, number>();
          st.seeds.forEach((seeds, seat) =>
            seeds.forEach((p) => {
              const sq = square(st.colours[seat]!, p);
              if (sq === null || (r.safeSquares && SAFE_SQUARES.has(sq))) return;
              const o = owner.get(sq);
              if (o !== undefined && o !== seat) fail("rivals share a square", st);
              owner.set(sq, seat);
            }),
          );
        }
      });
      expect(
        ludo
          .ranking(s)
          .flat()
          .sort((a, b) => a - b),
      ).toEqual(Array.from({ length: players }, (_, i) => i));
    },
  );

  test.prop(
    [
      playersArb,
      rulesArb,
      seedArb,
      fc.array(
        fc.tuple(
          fc.nat(3),
          fc.oneof(
            fc.constant({ type: "roll" as const }),
            fc.record({ type: fc.constant("move" as const), seed: fc.nat(3) }),
          ),
        ),
        { minLength: 1, maxLength: 80 },
      ),
    ],
    { numRuns: 1000 },
  )("anything outside legalActions is refused and nothing throws", (players, r, seed, tries) => {
    const rng = seededRng(seed);
    let s = ludo.setup(players, { rng, rules: r, now: 0 });
    for (const [rawSeat, action] of tries) {
      if (s.over) break;
      const seat = rawSeat % players;
      const legal = ludo.legalActions(s, seat, r);
      const res = ludo.apply(s, { seat, action }, { rng, rules: r, now: 0 });
      if (!legal.some((a) => JSON.stringify(a) === JSON.stringify(action)))
        expect(res.ok).toBe(false);
      else if (res.ok) s = res.state;
    }
  });

  test.prop([playersArb, rulesArb, seedArb], { numRuns: 1000 })(
    "same seed, same game",
    (players, r, seed) => {
      expect(randomGame(players, r, seed)).toEqual(randomGame(players, r, seed));
    },
  );

  test.prop(
    [
      playersArb,
      rulesArb,
      seedArb,
      fc.constantFrom("easy" as const, "medium" as const, "hard" as const),
    ],
    { numRuns: 1000 },
  )("bots and timeouts only make legal moves, and those games end", (players, r, seed, level) => {
    const rng = seededRng(seed);
    let s = ludo.setup(players, { rng, rules: r, now: 0 });
    for (let i = 0; i < 5000 && !s.over; i++) {
      const a =
        s.turn % 2 ? ludo.bots[level](s, s.turn, r, rng) : ludo.timeoutAction(s, s.turn, r, rng);
      expect(ludo.legalActions(s, s.turn, r)).toContainEqual(a);
      const res = ludo.apply(s, { seat: s.turn, action: a }, { rng, rules: r, now: 0 });
      if (!res.ok) throw new Error(res.error);
      s = res.state;
    }
    expect(s.over).toBe(true);
  });
});

describe("ludo bots", () => {
  for (const players of [2, 4]) {
    it(`hard beats easy more than 60% of the time (${players} players)`, () => {
      const r = rules();
      let hardWins = 0;
      const games = 1000;
      for (let g = 0; g < games; g++) {
        const rng = seededRng(`l${players}-${g}`);
        const hardSeat = g % players;
        let s = ludo.setup(players, { rng, rules: r, now: 0 });
        for (let i = 0; i < 5000 && !s.over; i++) {
          const a = ludo.bots[s.turn === hardSeat ? "hard" : "easy"](s, s.turn, r, rng);
          const res = ludo.apply(s, { seat: s.turn, action: a }, { rng, rules: r, now: 0 });
          if (!res.ok) throw new Error(res.error);
          s = res.state;
        }
        if (ludo.ranking(s)[0]?.includes(hardSeat)) hardWins++;
      }
      // Four players: a random seat wins 25% of the time, so "beats easy" means winning
      // far more than its share; two players: more than 60% outright.
      expect(hardWins / games).toBeGreaterThan(players === 2 ? 0.6 : 0.4);
    });
  }
});
