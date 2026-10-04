import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import type { SeatIndex } from "../../types";
import { tictactoe as ttt, type TttRules } from "./index";
import type { TttAction, TttState } from "./state";

const rules = (r: Partial<TttRules> = {}): TttRules => ({ ...ttt.presets.naija, ...r });
const ctx = (r: TttRules, seed = "seed") => ({ rng: seededRng(seed), rules: r, now: 0 });
const place = (cell: number): TttAction => ({ type: "place", cell });

/** Plays cells alternately from the current state; returns the final state. */
function play(s: TttState, r: TttRules, cells: number[]): TttState {
  for (const cell of cells) {
    const res = ttt.apply(s, { seat: s.turn, action: place(cell) }, ctx(r));
    if (!res.ok) throw new Error(`rejected ${cell}: ${res.error}`);
    s = res.state;
  }
  return s;
}
const nextRound = (s: TttState, r: TttRules) => {
  const res = ttt.apply(s, { seat: 0, action: { type: "next_round" } }, ctx(r));
  if (!res.ok) throw new Error(res.error);
  return res.state;
};

// Seat 0 takes the top row.
const WIN_FOR_STARTER = [0, 3, 1, 4, 2];
// Ends level: X O X / X O O / O X X
const DRAW = [0, 1, 2, 4, 3, 5, 7, 6, 8];

describe("tic-tac-toe rules", () => {
  it("rows, columns and diagonals win", () => {
    const r = rules({ bestOf: 1 });
    for (const [cells, line] of [
      [
        [0, 3, 1, 4, 2],
        [0, 1, 2],
      ],
      [
        [0, 1, 3, 2, 6],
        [0, 3, 6],
      ],
      [
        [0, 1, 4, 2, 8],
        [0, 4, 8],
      ],
      [
        [2, 0, 4, 1, 6],
        [2, 4, 6],
      ],
    ] as const) {
      const s = play(ttt.setup(2, ctx(r)), r, [...cells]);
      expect(s.roundWinner).toBe(0);
      expect(s.winLine).toEqual(line);
      expect(s.over).toBe(true);
      expect(ttt.ranking(s)).toEqual([[0], [1]]);
    }
  });

  it("a full board with no line is a drawn round", () => {
    const r = rules({ bestOf: 3 });
    const s = play(ttt.setup(2, ctx(r)), r, DRAW);
    expect(s.roundWinner).toBe("draw");
    expect(s.draws).toBe(1);
    expect(s.over).toBe(false);
  });

  it("rejects out-of-turn moves, taken cells and moves after a round ends", () => {
    const r = rules();
    const s0 = ttt.setup(2, ctx(r));
    expect(ttt.apply(s0, { seat: 1, action: place(0) }, ctx(r))).toEqual({
      ok: false,
      error: "NOT_YOUR_TURN",
    });
    const s1 = play(s0, r, [4]);
    expect(ttt.apply(s1, { seat: 1, action: place(4) }, ctx(r))).toEqual({
      ok: false,
      error: "ILLEGAL_MOVE",
    });
    const done = play(s0, r, WIN_FOR_STARTER);
    expect(ttt.apply(done, { seat: 1, action: place(8) }, ctx(r))).toEqual({
      ok: false,
      error: "ILLEGAL_MOVE",
    });
    expect(ttt.apply(s0, { seat: 0, action: { type: "next_round" } }, ctx(r))).toEqual({
      ok: false,
      error: "ILLEGAL_MOVE",
    });
  });

  it("best of 3 ends at two wins", () => {
    const r = rules({ bestOf: 3, alternateStarter: false });
    let s = play(ttt.setup(2, ctx(r)), r, WIN_FOR_STARTER);
    expect(s.over).toBe(false);
    s = play(nextRound(s, r), r, WIN_FOR_STARTER);
    expect(s.over).toBe(true);
    expect(s.seriesWinner).toBe(0);
    expect(s.score).toEqual([2, 0]);
    expect(ttt.apply(s, { seat: 0, action: { type: "next_round" } }, ctx(r))).toEqual({
      ok: false,
      error: "GAME_OVER",
    });
  });

  it("alternateStarter swaps who opens each round", () => {
    const on = rules({ alternateStarter: true });
    const off = rules({ alternateStarter: false });
    const won = (r: TttRules) => play(ttt.setup(2, ctx(r)), r, WIN_FOR_STARTER);
    expect(nextRound(won(on), on).turn).toBe(1);
    expect(nextRound(won(off), off).turn).toBe(0);
  });

  it("leader after all rounds wins even without a majority", () => {
    const r = rules({ bestOf: 3, alternateStarter: false });
    let s = play(ttt.setup(2, ctx(r)), r, WIN_FOR_STARTER);
    s = play(nextRound(s, r), r, DRAW);
    s = play(nextRound(s, r), r, DRAW);
    expect(s.over).toBe(true);
    expect(s.seriesWinner).toBe(0);
  });

  it("level after all rounds: sudden death, then a draw after 3 extra rounds", () => {
    const r = rules({ bestOf: 1 });
    let s = play(ttt.setup(2, ctx(r)), r, DRAW);
    for (let extra = 1; extra <= 3; extra++) {
      expect(s.over).toBe(false);
      s = play(nextRound(s, r), r, DRAW);
    }
    expect(s.over).toBe(true);
    expect(s.seriesWinner).toBe("draw");
    expect(ttt.ranking(s)).toEqual([[0, 1]]);
  });

  it("sudden death win settles it", () => {
    const r = rules({ bestOf: 1, alternateStarter: false });
    let s = play(ttt.setup(2, ctx(r)), r, DRAW);
    s = play(nextRound(s, r), r, WIN_FOR_STARTER);
    expect(s.over).toBe(true);
    expect(s.seriesWinner).toBe(0);
  });

  it("auto-advances 2.5 s after a round, not after the series", () => {
    const r = rules({ bestOf: 3 });
    const s = play(ttt.setup(2, ctx(r)), r, WIN_FOR_STARTER);
    expect(ttt.autoAdvance(s, r)).toEqual({
      seat: 0,
      action: { type: "next_round" },
      afterMs: 2500,
    });
    expect(ttt.autoAdvance(ttt.setup(2, ctx(r)), r)).toBeNull();
    const r1 = rules({ bestOf: 1 });
    expect(ttt.autoAdvance(play(ttt.setup(2, ctx(r1)), r1, WIN_FOR_STARTER), r1)).toBeNull();
  });

  it("Naija Standard preset validates", () => {
    expect(ttt.ruleSchema.safeParse(ttt.presets.naija).success).toBe(true);
    expect(ttt.ruleSchema.safeParse({ ...ttt.presets.naija, bestOf: 2 }).success).toBe(false);
    expect(ttt.ruleSchema.safeParse({ ...ttt.presets.naija, turnSeconds: 5 }).success).toBe(false);
  });
});

// ── Property tests ───────────────────────────────────────────────────────────

const rulesArb = fc.record({
  turnSeconds: fc.integer({ min: 10, max: 120 }),
  bestOf: fc.constantFrom(1 as const, 3 as const, 5 as const),
  alternateStarter: fc.boolean(),
});
const seedArb = fc.string({ minLength: 1, maxLength: 16 });

/** Random play to the end; checks invariants after every step. Returns action count. */
function randomGame(r: TttRules, seed: string, onStep?: (s: TttState) => void) {
  const rng = seededRng(seed);
  let s = ttt.setup(2, { rng, rules: r, now: 0 });
  let steps = 0;
  while (!ttt.isOver(s)) {
    if (steps++ > 200) throw new Error("did not terminate");
    const auto = ttt.autoAdvance(s, r);
    let seat: SeatIndex, action: TttAction;
    if (auto) ({ seat, action } = auto);
    else {
      seat = ttt.currentSeats(s)[0]!;
      const legal = ttt.legalActions(s, seat, r);
      action = legal[rng.int(legal.length)]!;
    }
    const res = ttt.apply(s, { seat, action }, { rng, rules: r, now: 0 });
    if (!res.ok) throw new Error(`legal action rejected: ${res.error}`);
    s = res.state;
    onStep?.(s);
  }
  return { s, steps };
}

describe("tic-tac-toe properties", () => {
  test.prop([rulesArb, seedArb], { numRuns: 1000 })(
    "random games end within 80 actions and keep invariants",
    (r, seed) => {
      const { s, steps } = randomGame(r, seed, (st) => {
        const x = st.board.filter((c) => c === 0).length;
        const o = st.board.filter((c) => c === 1).length;
        expect(Math.abs(x - o)).toBeLessThanOrEqual(1);
        const completed = st.roundWinner === null ? st.round - 1 : st.round;
        expect(st.score[0] + st.score[1] + st.draws).toBe(completed);
      });
      expect(steps).toBeLessThanOrEqual(80);
      expect(s.over).toBe(true);
      expect(s.round).toBeLessThanOrEqual(r.bestOf + 3);
    },
  );

  test.prop([rulesArb, seedArb], { numRuns: 300 })(
    "same seed and actions give identical games",
    (r, seed) => {
      expect(randomGame(r, seed).s).toEqual(randomGame(r, seed).s);
    },
  );

  test.prop([rulesArb, seedArb, fc.integer({ min: 0, max: 1 }), fc.integer({ min: -3, max: 12 })], {
    numRuns: 1000,
  })("anything outside legalActions is rejected and apply never throws", (r, seed, seat, cell) => {
    const rng = seededRng(seed);
    let s = ttt.setup(2, { rng, rules: r, now: 0 });
    for (let i = 0; i < rng.int(6) && !ttt.isOver(s); i++) {
      const legal = ttt.legalActions(s, s.turn, r);
      if (!legal.length) break;
      const res = ttt.apply(
        s,
        { seat: s.turn, action: legal[rng.int(legal.length)]! },
        { rng, rules: r, now: 0 },
      );
      if (res.ok) s = res.state;
    }
    const action = { type: "place", cell } as TttAction;
    const isLegal = ttt.legalActions(s, seat, r).some((a) => a.type === "place" && a.cell === cell);
    const res = ttt.apply(s, { seat, action }, { rng, rules: r, now: 0 });
    if (!isLegal && cell >= 0 && cell <= 8) expect(res.ok).toBe(false);
  });

  test.prop(
    [rulesArb, seedArb, fc.constantFrom("easy" as const, "medium" as const, "hard" as const)],
    { numRuns: 300 },
  )("bots and the timeout action only choose legal moves", (r, seed, level) => {
    const rng = seededRng(seed);
    let s = ttt.setup(2, { rng, rules: r, now: 0 });
    while (!ttt.isOver(s)) {
      const auto = ttt.autoAdvance(s, r);
      if (auto) {
        const res = ttt.apply(s, auto, { rng, rules: r, now: 0 });
        if (!res.ok) throw new Error(res.error);
        s = res.state;
        continue;
      }
      const seat = s.turn;
      const pick =
        seat === 0 ? ttt.bots[level](s, seat, r, rng) : ttt.timeoutAction(s, seat, r, rng);
      expect(ttt.legalActions(s, seat, r)).toContainEqual(pick);
      const res = ttt.apply(s, { seat, action: pick }, { rng, rules: r, now: 0 });
      if (!res.ok) throw new Error(res.error);
      s = res.state;
    }
  });
});

describe("tic-tac-toe bots", () => {
  /** Hard plays seat `hardSeat`; every possible opponent reply is explored. */
  function hardNeverLoses(hardSeat: SeatIndex) {
    const r = rules({ bestOf: 1 });
    const visit = (s: TttState, depth: number) => {
      if (s.roundWinner !== null) {
        expect(s.roundWinner, `hard lost at depth ${depth}`).not.toBe(1 - hardSeat);
        return;
      }
      if (s.turn === hardSeat) {
        // Try several RNG streams: Hard breaks ties randomly.
        for (const seed of ["a", "b", "c"]) {
          const a = ttt.bots.hard(s, hardSeat, r, seededRng(seed + depth));
          const res = ttt.apply(s, { seat: hardSeat, action: a }, ctx(r));
          if (res.ok) visit(res.state, depth + 1);
        }
      } else {
        for (const a of ttt.legalActions(s, s.turn, r)) {
          const res = ttt.apply(s, { seat: s.turn, action: a }, ctx(r));
          if (res.ok) visit(res.state, depth + 1);
        }
      }
    };
    visit(ttt.setup(2, ctx(r)), 0);
  }

  it("hard never loses going first", () => hardNeverLoses(0));
  it("hard never loses going second", () => {
    // Seat 1 moves second in round 1.
    hardNeverLoses(1);
  });

  it("medium takes a win and blocks a threat", () => {
    const r = rules();
    // X at 0,1 (seat 0 to win at 2)
    const s1 = play(ttt.setup(2, ctx(r)), r, [0, 4, 1, 8]);
    expect(ttt.bots.medium(s1, 0, r, seededRng("x"))).toEqual(place(2));
    // O must block X's 0-1-? line
    const s2 = play(ttt.setup(2, ctx(r)), r, [0, 4, 1]);
    expect(ttt.bots.medium(s2, 1, r, seededRng("x"))).toEqual(place(2));
  });

  it("hard beats easy far more often than not", () => {
    const r = rules({ bestOf: 1 });
    let hardWins = 0,
      easyWins = 0;
    for (let g = 0; g < 400; g++) {
      const rng = seededRng(`g${g}`);
      const hardSeat = (g % 2) as SeatIndex;
      let s = ttt.setup(2, { rng, rules: r, now: 0 });
      while (s.roundWinner === null) {
        const level = s.turn === hardSeat ? "hard" : "easy";
        const res = ttt.apply(
          s,
          { seat: s.turn, action: ttt.bots[level](s, s.turn, r, rng) },
          { rng, rules: r, now: 0 },
        );
        if (!res.ok) throw new Error(res.error);
        s = res.state;
      }
      if (s.roundWinner === hardSeat) hardWins++;
      else if (s.roundWinner !== "draw") easyWins++;
    }
    expect(easyWins).toBe(0);
    expect(hardWins / 400).toBeGreaterThan(0.6);
  });
});
