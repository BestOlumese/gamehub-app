import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import type { Rng } from "../../types";
import { BOARD_IDS, BOARDS } from "./boards";
import { snakes, type SnakesRules, type SnakesState } from "./index";

const rules = (r: Partial<SnakesRules> = {}): SnakesRules => ({ ...snakes.presets.naija, ...r });

/** An RNG that rolls the given dice in order. */
function dice(...values: number[]): Rng {
  let i = 0;
  return { int: () => (values[i++] ?? 1) - 1, shuffle: (a) => [...a], counter: () => i };
}
const state = (p: Partial<SnakesState> & { pos: number[] }): SnakesState => ({
  players: p.pos.length,
  board: "naija-classic",
  turn: 0,
  sixesInRow: 0,
  lastRoll: null,
  finished: [],
  over: false,
  places: null,
  ...p,
});
function roll(s: SnakesState, value: number, r: SnakesRules) {
  const res = snakes.apply(
    s,
    { seat: s.turn, action: { type: "roll" } },
    { rng: dice(value), rules: r, now: 0 },
  );
  if (!res.ok) throw new Error(res.error);
  return res;
}

describe("boards", () => {
  for (const id of BOARD_IDS) {
    it(`${id}: ladders go up, snakes go down, nothing on 1 or 100, no chains`, () => {
      const b = BOARDS[id];
      const starts = [...Object.keys(b.ladders), ...Object.keys(b.snakes)].map(Number);
      const ends = [...Object.values(b.ladders), ...Object.values(b.snakes)];
      for (const [a, z] of Object.entries(b.ladders)) expect(z).toBeGreaterThan(Number(a));
      for (const [a, z] of Object.entries(b.snakes)) expect(z).toBeLessThan(Number(a));
      expect(new Set(starts).size).toBe(starts.length); // no square is both a snake head and a ladder foot
      for (const sq of [...starts, ...ends]) expect(sq > 1 && sq < 100).toBe(true);
      for (const e of ends) expect(starts).not.toContain(e);
    });
  }

  // docs/games/snakes-and-ladders.md: 10,000 random 4-player games, median 25–60 rounds.
  for (const id of BOARD_IDS) {
    it(`${id}: 10,000 four-player games, median length 25–60 rounds, all finish`, () => {
      const r = rules({ board: id });
      const rounds: number[] = [];
      for (let g = 0; g < 10_000; g++) {
        const rng = seededRng(`${id}:${g}`);
        let s = snakes.setup(4, { rng, rules: r, now: 0 });
        let n = 0;
        let lastTurn = s.turn;
        let round = 1;
        while (!s.over) {
          const res = snakes.apply(
            s,
            { seat: s.turn, action: { type: "roll" } },
            { rng, rules: r, now: 0 },
          );
          if (!res.ok) throw new Error(res.error);
          s = res.state;
          if (s.turn < lastTurn) round++; // turn order wrapped round: a new round
          lastTurn = s.turn;
          if (++n > 20_000) throw new Error("game did not end");
        }
        rounds.push(round);
      }
      rounds.sort((a, b) => a - b);
      const median = rounds[5000]!;
      expect(median).toBeGreaterThanOrEqual(25);
      expect(median).toBeLessThanOrEqual(60);
    }, 60_000);
  }
});

describe("moving", () => {
  it("climbs ladders and slides down snakes", () => {
    const up = roll(state({ pos: [0, 0] }), 3, rules());
    expect(up.state.pos[0]).toBe(22); // ladder 3 → 22
    expect(up.events.map((e) => e.type)).toEqual(["rolled", "moved", "ladder"]);
    const down = roll(state({ pos: [15, 0] }), 4, rules());
    expect(down.state.pos[0]).toBe(6); // snake 19 → 6
    expect(down.events.find((e) => e.type === "moved")).toMatchObject({ path: [16, 17, 18, 19] });
  });

  it("an exact roll is needed for 100; overshoot stays put. Off: passing 100 wins", () => {
    const s = state({ pos: [97, 10] });
    const stay = roll(s, 5, rules());
    expect(stay.state.pos[0]).toBe(97);
    expect(stay.state.turn).toBe(1);
    const win = roll(s, 5, rules({ exactRollToFinish: false }));
    expect(win.state.pos[0]).toBe(100);
    expect(win.state.over).toBe(true); // 2 players: one left → over
  });

  it("a six rolls again (off: turn passes); three sixes lose the turn", () => {
    expect(roll(state({ pos: [10, 10] }), 6, rules()).state.turn).toBe(0);
    expect(roll(state({ pos: [10, 10] }), 6, rules({ sixRollsAgain: false })).state.turn).toBe(1);
    const third = roll(state({ pos: [10, 10], sixesInRow: 2 }), 6, rules());
    expect(third.events.map((e) => e.type)).toContain("six_forfeit");
    expect(third.state.pos[0]).toBe(10);
    expect(third.state.turn).toBe(1);
    expect(
      roll(state({ pos: [10, 10], sixesInRow: 2 }), 6, rules({ maxConsecutiveSixes: 0 })).state
        .pos[0],
    ).toBe(16);
  });

  it("need a six to start, when that's on", () => {
    const r = rules({ needSixToStart: true });
    expect(roll(state({ pos: [0, 0] }), 4, r).state.pos[0]).toBe(0);
    expect(roll(state({ pos: [0, 0] }), 6, r).state.pos[0]).toBe(6);
  });

  it("bump sends whoever was on your square back to the start", () => {
    const s = state({ pos: [10, 14] });
    expect(roll(s, 4, rules()).state.pos).toEqual([14, 14]);
    const bumped = roll(s, 4, rules({ bump: true }));
    expect(bumped.state.pos).toEqual([14, 0]);
    expect(bumped.events.map((e) => e.type)).toContain("bumped");
  });
});

describe("ending", () => {
  it("play on: places in finishing order, last player placed when one is left", () => {
    const a = roll(state({ pos: [99, 99, 50] }), 1, rules()).state;
    expect(a).toMatchObject({ finished: [0], over: false, turn: 1 });
    const b = roll(a, 1, rules()).state;
    expect(b.over).toBe(true);
    expect(snakes.ranking(b)).toEqual([[0], [1], [2]]);
  });

  it("first finisher ends it; the rest rank by square (ties share)", () => {
    const t = roll(state({ pos: [99, 40, 40, 12] }), 1, rules({ firstFinisherEnds: true })).state;
    expect(snakes.ranking(t)).toEqual([[0], [1, 2], [3]]);
  });

  it("auto roll makes the roll by itself after a pause", () => {
    expect(snakes.autoAdvance(state({ pos: [0, 0] }), rules())).toBeNull();
    expect(snakes.autoAdvance(state({ pos: [0, 0] }), rules({ autoRoll: true }))).toMatchObject({
      action: { type: "roll" },
      afterMs: 1500,
    });
  });

  it("only the player on turn may roll", () => {
    const res = snakes.apply(
      state({ pos: [0, 0] }),
      { seat: 1, action: { type: "roll" } },
      { rng: dice(3), rules: rules(), now: 0 },
    );
    expect(res).toEqual({ ok: false, error: "NOT_YOUR_TURN" });
  });
});

// ── Properties ───────────────────────────────────────────────────────────────

const rulesArb = fc.record({
  turnSeconds: fc.integer({ min: 10, max: 120 }),
  board: fc.constantFrom(...BOARD_IDS),
  exactRollToFinish: fc.boolean(),
  sixRollsAgain: fc.boolean(),
  maxConsecutiveSixes: fc.constantFrom(0, 2, 3, 4, 5),
  needSixToStart: fc.boolean(),
  bump: fc.boolean(),
  firstFinisherEnds: fc.boolean(),
  autoRoll: fc.boolean(),
});

describe("properties", () => {
  test.prop(
    [fc.integer({ min: 2, max: 8 }), rulesArb, fc.string({ minLength: 1, maxLength: 12 })],
    { numRuns: 1000 },
  )(
    "squares stay 0–100, nobody rests on a snake head or ladder foot, finished means 100, every game ends",
    (players, r, seed) => {
      const rng = seededRng(seed);
      const board = BOARDS[r.board];
      let s = snakes.setup(players, { rng, rules: r, now: 0 });
      let steps = 0;
      while (!s.over) {
        if (++steps > 6000) throw new Error("did not end within 6,000 rolls");
        const res = snakes.apply(
          s,
          { seat: s.turn, action: { type: "roll" } },
          { rng, rules: r, now: 0 },
        );
        if (!res.ok) throw new Error(res.error);
        s = res.state;
        for (const [seat, p] of s.pos.entries()) {
          if (p < 0 || p > 100) throw new Error("out of range");
          if (board.ladders[p] !== undefined || board.snakes[p] !== undefined)
            throw new Error(`resting on ${p}`);
          if (p === 100 && !s.finished.includes(seat)) throw new Error("100 but not finished");
        }
      }
      expect(
        snakes
          .ranking(s)
          .flat()
          .sort((a, b) => a - b),
      ).toEqual(Array.from({ length: players }, (_, i) => i));
    },
  );

  test.prop(
    [fc.integer({ min: 2, max: 8 }), rulesArb, fc.string({ minLength: 1, maxLength: 12 })],
    { numRuns: 1000 },
  )("same seed, same game", (players, r, seed) => {
    const play = () => {
      const rng = seededRng(seed);
      let s = snakes.setup(players, { rng, rules: r, now: 0 });
      for (let i = 0; i < 6000 && !s.over; i++) {
        const res = snakes.apply(
          s,
          { seat: s.turn, action: { type: "roll" } },
          { rng, rules: r, now: 0 },
        );
        if (res.ok) s = res.state;
      }
      return s;
    };
    expect(play()).toEqual(play());
  });
});
