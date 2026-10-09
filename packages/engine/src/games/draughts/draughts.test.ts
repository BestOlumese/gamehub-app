import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import type { SeatIndex } from "../../types";
import { encode, genRules, geometry, legalMoves as gen, startBoard } from "./board";
import { EASY, MEDIUM, searchMove } from "./bots";
import {
  colourOf,
  drawByRule,
  endgame,
  legalMoves,
  quietPlies,
  repetitions,
  seatOf,
  squareAt,
} from "./core";
import { draughts, draughtsEnglish, draughtsNaija, type DraughtsRules } from "./index";
import type { DraughtsAction, DraughtsState } from "./state";

const rules = (r: Partial<DraughtsRules> = {}): DraughtsRules => ({ ...draughtsNaija, ...r });
const T0 = 1_000_000;
const start = (r: DraughtsRules, first = 0, seed = "d") =>
  draughts.setup(2, { rng: seededRng(seed), rules: r, now: T0 }, first);

function act(
  s: DraughtsState,
  seat: SeatIndex,
  action: DraughtsAction,
  r: DraughtsRules,
  now = T0,
) {
  const res = draughts.apply(s, { seat, action }, { rng: seededRng("a"), rules: r, now });
  if (!res.ok) throw new Error(`${seat} ${JSON.stringify(action)}: ${res.error}`);
  return res;
}
const reject = (
  s: DraughtsState,
  seat: SeatIndex,
  action: DraughtsAction,
  r: DraughtsRules,
  now = T0,
) => {
  const res = draughts.apply(s, { seat, action }, { rng: seededRng("a"), rules: r, now });
  return res.ok ? null : res.error;
};
/** Plays "32-28" style moves for whoever is to move, `step` ms apart. */
function play(s: DraughtsState, moves: string[], r: DraughtsRules, now = T0, step = 1000) {
  let st = s;
  let t = now;
  for (const m of moves) {
    t += step;
    const [from, ...path] = m.split(/[-x]/).map(Number);
    st = act(st, seatOf(st, st.turn), { type: "move", from: from as number, path }, r, t).state;
  }
  return { s: st, t };
}

/** 1-based square at a row and column (0 = top, standard layout). */
function sq(v: DraughtsState["variant"], row: number, col: number): number {
  const g = geometry(v);
  for (let i = 0; i < g.squares; i++) if (g.row[i] === row && g.col[i] === col) return i + 1;
  throw new Error(`(${row},${col}) is not a dark square`);
}
/** A position set up from pieces ([row, col, ±1 man / ±2 king], + light), as if reached in play. */
function at(
  pieces: Array<[number, number, number]>,
  r: DraughtsRules,
  turn: "light" | "dark" = "light",
  plies = 10,
): DraughtsState {
  const s = start(r);
  const board = new Array<number>(geometry(s.variant).squares).fill(0);
  for (const [row, col, v] of pieces) board[sq(s.variant, row, col) - 1] = v;
  return {
    ...s,
    board,
    turn,
    history: [encode(board)],
    moves: Array(plies).fill({ from: 1, path: [2], captured: [] }),
    turnStartedAt: T0,
  };
}
const N = "naija10" as const;

describe("draughts setup", () => {
  it("naija10: 20 seeds each on the four nearest rows; the first seat moves first", () => {
    const r = rules({ firstMove: "light" });
    const s = start(r, 1);
    expect(s.board.filter((v) => v === 1)).toHaveLength(20);
    expect(s.board.filter((v) => v === -1)).toHaveLength(20);
    expect(s.board.slice(20, 30).every((v) => v === 0)).toBe(true);
    expect(s.light).toBe(1);
    expect(s.turn).toBe("light");
    expect(draughts.currentSeats(s)).toEqual([1]);
  });

  it("first move by colour: dark first gives the first seat dark; english8 is always dark first", () => {
    const s = start(rules({ firstMove: "dark" }), 0);
    expect([s.turn, colourOf(s, 0)]).toEqual(["dark", "dark"]);
    const e = start(draughtsEnglish, 1);
    expect([e.variant, e.turn, colourOf(e, 1), e.board.length]).toEqual([
      "english8",
      "dark",
      "dark",
      32,
    ]);
    expect(e.board.filter((v) => v === -1)).toHaveLength(12);
  });

  it("random first move (drawing lots) gives both colours over different seeds", () => {
    const turns = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((x) => start(rules(), 0, x).turn),
    );
    expect(turns).toEqual(new Set(["light", "dark"]));
  });

  it("presets and every rules option pass the schema; bad values don't", () => {
    expect(draughts.ruleSchema.safeParse(draughtsNaija).success).toBe(true);
    expect(draughts.ruleSchema.safeParse(draughtsEnglish).success).toBe(true);
    expect(
      draughts.ruleSchema.safeParse(
        rules({ timeControl: { baseSeconds: 300, incrementSeconds: 3 }, captureRule: "majority" }),
      ).success,
    ).toBe(true);
    expect(
      draughts.ruleSchema.safeParse(rules({ timeControl: { baseSeconds: 7, incrementSeconds: 0 } }))
        .success,
    ).toBe(false);
    expect(draughts.actionSchema.safeParse({ type: "move", from: 51, path: [46] }).success).toBe(
      false,
    );
    expect(draughts.actionSchema.safeParse({ type: "flag" }).success).toBe(false);
  });

  it("the Nigerian board is the FMJD one mirrored; each player sees their own seeds at the bottom", () => {
    // FMJD: square 46 is the bottom-left corner; mirrored, it's bottom-right.
    expect(squareAt(N, "fmjd", 46, false)).toEqual({ col: 0, row: 9 });
    expect(squareAt(N, "naija", 46, false)).toEqual({ col: 9, row: 9 });
    expect(squareAt(N, "naija", 46, true)).toEqual({ col: 0, row: 0 });
    // The long diagonal runs from the player's bottom-right in the Nigerian orientation.
    expect(squareAt(N, "naija", 5, false)).toEqual({ col: 0, row: 0 });
    expect(squareAt("english8", "naija", 29, false)).toEqual({ col: 0, row: 7 });
  });
});

describe("draughts moves", () => {
  const r = rules({ firstMove: "light" });

  it("plays moves in notation order, light then dark, and rejects illegal ones", () => {
    const s = start(r);
    expect(reject(s, 0, { type: "move", from: 32, path: [23] }, r)).toBe("ILLEGAL_MOVE");
    expect(reject(s, 1, { type: "move", from: 19, path: [23] }, r)).toBe("NOT_YOUR_TURN");
    expect(reject(s, 0, { type: "move", from: 31, path: [26] }, r)).toBeNull();
    const { s: after } = play(s, ["32-28", "19-23"], r);
    expect(after.moves.map((m) => [m.from, m.path])).toEqual([
      [32, [28]],
      [19, [23]],
    ]);
    expect(after.history).toHaveLength(3);
    expect(after.turn).toBe("light");
  });

  it("a capture is compulsory and lists every landing; the event names the seeds taken", () => {
    const s = play(start(r), ["32-28", "19-23"], r).s;
    // 28x19: light must take 23.
    expect(reject(s, 0, { type: "move", from: 34, path: [30] }, r)).toBe("ILLEGAL_MOVE");
    const res = act(s, 0, { type: "move", from: 28, path: [19] }, r, T0 + 5000);
    expect(res.state.board[22]).toBe(0);
    expect(res.events.find((e) => e.type === "moved")).toMatchObject({
      notation: "28x19",
      captured: [23],
    });
  });

  it("wins when the other side has no seeds left", () => {
    const s = at(
      [
        [6, 3, 1],
        [5, 4, -1],
      ],
      r,
    );
    const res = act(s, 0, { type: "move", from: sq(N, 6, 3), path: [sq(N, 4, 5)] }, r);
    expect(res.state.result).toEqual({ winner: "light", reason: "no_pieces" });
    expect(draughts.ranking(res.state)).toEqual([[0], [1]]);
  });

  it("wins when the other side has no legal move", () => {
    // Dark's last man is boxed in by light men it can't take (nothing empty beyond them).
    const s = at(
      [
        [8, 1, -1],
        [9, 0, 1],
        [9, 2, 1],
        [7, 0, 1],
        [7, 2, 1],
        [6, 3, 1],
        [3, 4, 1],
      ],
      r,
    );
    const res = act(s, 0, { type: "move", from: sq(N, 3, 4), path: [sq(N, 2, 3)] }, r);
    expect(res.state.result).toEqual({ winner: "light", reason: "blocked" });
  });

  it("a man that ends on the far row is crowned; a king then flies and takes from afar", () => {
    const s = at(
      [
        [1, 2, 1],
        [5, 8, -1],
        [3, 0, -1],
      ],
      r,
    );
    const crowned = act(s, 0, { type: "move", from: sq(N, 1, 2), path: [sq(N, 0, 3)] }, r);
    expect(crowned.events.find((e) => e.type === "moved")).toMatchObject({ crowned: true });
    expect(crowned.state.board[sq(N, 0, 3) - 1]).toBe(2);
    const d = act(crowned.state, 1, { type: "move", from: sq(N, 3, 0), path: [sq(N, 4, 1)] }, r);
    // The king on (0,3) sees the man on (5,8) down the long diagonal: a capture, landing (6,9).
    const legal = legalMoves(d.state, r);
    expect(legal).toEqual([{ from: sq(N, 0, 3), path: [sq(N, 6, 9)], captured: [sq(N, 5, 8)] }]);
  });
});

describe("draughts draw rules", () => {
  const r = rules({ firstMove: "light" });

  it("threefold repetition: the same position with the same side to move, three times", () => {
    const s = at(
      [
        [9, 2, 2],
        [9, 4, 2],
        [0, 5, -2],
        [0, 7, -2],
      ],
      r,
    );
    const a = sq(N, 9, 2);
    const b = sq(N, 8, 1);
    const c = sq(N, 0, 5);
    const d = sq(N, 1, 4);
    const cycle = [`${a}-${b}`, `${c}-${d}`, `${b}-${a}`, `${d}-${c}`];
    const once = play(s, cycle, r).s;
    expect(once.result).toBeNull();
    expect(repetitions(once.history)).toBe(2);
    const twice = play(once, cycle, r).s;
    expect(twice.result).toEqual({ winner: null, reason: "threefold" });
  });

  it("a lone king each is drawn at once", () => {
    const s = at(
      [
        [9, 0, 2],
        [5, 4, -1],
        [0, 1, -2],
      ],
      r,
    );
    const [m] = legalMoves(s, r);
    const res = act(s, 0, { type: "move", from: m?.from as number, path: m?.path as number[] }, r);
    expect(res.state.result).toEqual({ winner: null, reason: "kings" });
  });

  /** A history of distinct positions (kings moving, men still): no repetition, no progress. */
  function quietHistory(
    plies: number,
    fixed: Array<[number, number]>,
    v: DraughtsState["variant"] = N,
    kings: [number, number] = [2, -2],
  ): string[] {
    const n = geometry(v).squares;
    const free = Array.from({ length: n }, (_, i) => i).filter(
      (i) => !fixed.some(([at]) => at === i),
    );
    const out: string[] = [];
    for (let k = 0; k <= plies; k++) {
      const b = new Array<number>(n).fill(0);
      for (const [i, val] of fixed) b[i] = val;
      // Two kings walking through distinct pairs of squares.
      b[free[k % free.length] as number] = kings[0];
      b[free[(Math.floor(k / free.length) + 1 + k) % free.length] as number] = kings[1];
      out.push(encode(b));
    }
    return out;
  }

  it("naija10 25-move rule: 25 moves each with only kings moving", () => {
    const men: Array<[number, number]> = [
      [0, -1],
      [1, -1],
      [48, 1],
      [49, 1],
    ];
    const h49 = quietHistory(49, men);
    expect(quietPlies(h49)).toBe(49);
    expect(drawByRule({ history: h49, variant: N }, r)).toBeNull();
    const h50 = quietHistory(50, men);
    expect(drawByRule({ history: h50, variant: N }, r)).toBe("no_progress");
    expect(drawByRule({ history: h50, variant: N }, rules({ drawRules: "none" }))).toBeNull();
  });

  it("a man move or a capture restarts the count", () => {
    const h = quietHistory(50, [
      [0, -1],
      [49, 1],
    ]);
    const moved = [...h.slice(0, 30), h[30]?.replace(/l/, ".") as string, ...h.slice(31)];
    expect(quietPlies(moved)).toBeLessThan(30);
  });

  it("english8 40-move rule", () => {
    const men: Array<[number, number]> = [
      [0, -1],
      [31, 1],
    ];
    const r8 = draughtsEnglish;
    expect(
      drawByRule({ history: quietHistory(79, men, "english8"), variant: "english8" }, r8),
    ).toBeNull();
    expect(
      drawByRule({ history: quietHistory(80, men, "english8"), variant: "english8" }, r8),
    ).toBe("no_progress");
  });

  it("naija10 endgames: lone king v 3 with a king (16 moves each), v 2 or fewer (5 each)", () => {
    // Light: a king and two men (fixed); dark: a lone king. The kings walk.
    const three = quietHistory(31, [
      [10, 1],
      [11, 1],
    ]);
    expect(endgame(three)).toEqual({ kind: 16, plies: 31 });
    expect(drawByRule({ history: three, variant: N }, r)).toBeNull();
    const three32 = quietHistory(32, [
      [10, 1],
      [11, 1],
    ]);
    expect(drawByRule({ history: three32, variant: N }, r)).toBe("endgame");
    const two = quietHistory(10, [[10, 1]]);
    expect(endgame(two).kind).toBe(5);
    expect(drawByRule({ history: two, variant: N }, r)).toBe("endgame");
    expect(drawByRule({ history: quietHistory(9, [[10, 1]]), variant: N }, r)).toBeNull();
  });

  it("agreement: offer and accept", () => {
    const s = play(start(r), ["32-28", "19-23"], r).s;
    const offered = act(s, 0, { type: "offer_draw" }, r).state;
    expect(draughts.botReply?.(offered, 1, r)).toEqual({ type: "decline_draw" });
    const res = act(offered, 1, { type: "accept_draw" }, r);
    expect(res.state.result).toEqual({ winner: null, reason: "agreement" });
  });
});

describe("huffing", () => {
  const r = rules({ firstMove: "light", missedCapture: "huff" });

  it("a seed that could have captured but didn't may be blown, once, at the start of the next turn", () => {
    const s = at(
      [
        [6, 3, 1],
        [5, 4, -1],
        [9, 8, 1],
        [0, 1, -1],
      ],
      r,
    );
    // Light ignores the capture and moves the other man.
    const quiet = act(s, 0, { type: "move", from: sq(N, 9, 8), path: [sq(N, 8, 7)] }, r).state;
    expect(quiet.huffable).toEqual({ by: "dark", squares: [sq(N, 6, 3)] });
    expect(draughts.legalActions(quiet, 1, r)).toContainEqual({
      type: "huff",
      square: sq(N, 6, 3),
    });
    expect(reject(quiet, 1, { type: "huff", square: sq(N, 8, 7) }, r)).toBe("ILLEGAL_MOVE");
    const huffed = act(quiet, 1, { type: "huff", square: sq(N, 6, 3) }, r);
    expect(huffed.state.board[sq(N, 6, 3) - 1]).toBe(0);
    expect(huffed.state.turn).toBe("dark"); // huffing is free: still dark to move
    expect(reject(huffed.state, 1, { type: "huff", square: sq(N, 6, 3) }, r)).toBe("NOT_ALLOWED");
    expect(huffed.events).toContainEqual({ type: "huffed", side: "dark", square: sq(N, 6, 3) });
  });

  it("if the capturing seed itself moved away, it's blown on its new square; bots huff", () => {
    const s = at(
      [
        [6, 3, 1],
        [5, 4, -1],
        [0, 1, -1],
      ],
      r,
    );
    const quiet = act(s, 0, { type: "move", from: sq(N, 6, 3), path: [sq(N, 5, 2)] }, r).state;
    expect(quiet.huffable?.squares).toEqual([sq(N, 5, 2)]);
    expect(draughts.bots.easy(quiet, 1, r, seededRng("h"))).toEqual({
      type: "huff",
      square: sq(N, 5, 2),
    });
  });

  it("no huff when the move was a capture, or captures are forced", () => {
    const s = at(
      [
        [6, 3, 1],
        [5, 4, -1],
        [0, 1, -1],
      ],
      r,
    );
    const took = act(s, 0, { type: "move", from: sq(N, 6, 3), path: [sq(N, 4, 5)] }, r).state;
    expect(took.huffable).toBeNull();
  });
});

describe("draughts clocks, takebacks, timeouts", () => {
  const clocked = rules({
    firstMove: "light",
    timeControl: { baseSeconds: 300, incrementSeconds: 3 },
  });

  it("clocks start after both first moves; a move after the flag loses on time", () => {
    const { s, t } = play(start(clocked), ["32-28", "19-23"], clocked);
    expect(s.clock?.light.remainingMs).toBe(300_000);
    const due = draughts.turnDeadline?.(s, 0, clocked) as number;
    expect(due).toBeGreaterThan(t + 300_000);
    const late = act(s, 0, { type: "move", from: 28, path: [19] }, clocked, due + 1);
    expect(late.state.result).toEqual({ winner: "dark", reason: "timeout" });
    expect(draughts.timeoutAction(s, 0, clocked, seededRng("t"))).toEqual({ type: "flag" });
  });

  it("no first move in the abort window: aborted, back to the lobby", () => {
    const s = start(clocked);
    const res = act(s, 0, { type: "flag" }, clocked, T0 + 31_000);
    expect(draughts.aborted?.(res.state)).toBe(true);
    expect(draughts.ranking(res.state)).toEqual([]);
  });

  it("no clock: running out of move time plays a legal move", () => {
    const r = rules({ firstMove: "light" });
    const { s } = play(start(r), ["32-28", "19-23"], r);
    const a = draughts.timeoutAction(s, 0, r, seededRng("t"));
    expect(a).toEqual({ type: "move", from: 28, path: [19] });
  });

  it("takeback: back to the requester's last move, board and turn restored", () => {
    const r = rules({ firstMove: "light" });
    const { s } = play(start(r), ["32-28", "19-23", "28x19"], r);
    const asked = act(s, 1, { type: "request_takeback" }, r).state;
    expect(draughts.botReply?.(asked, 0, r)).toEqual({ type: "accept_takeback" });
    const back = act(asked, 0, { type: "accept_takeback" }, r);
    expect(back.events).toContainEqual({ type: "takeback_done", plies: 2 });
    expect(back.state.moves).toHaveLength(1);
    expect(back.state.turn).toBe("dark");
    expect(encode(back.state.board)).toBe(back.state.history.at(-1));
    expect(back.state.board[22]).toBe(0);
    expect(back.state.board[18]).toBe(-1);
  });
});

describe("draughts bots", () => {
  const r = rules({ firstMove: "light" });

  it("Easy and Medium always play legal moves and take when they must", () => {
    const rng = seededRng("bots");
    let s = start(r);
    for (let i = 0; i < 120 && !s.result; i++) {
      const seat = draughts.currentSeats(s)[0] as SeatIndex;
      const bot = i % 2 ? draughts.bots.medium : draughts.bots.easy;
      const a = bot(s, seat, r, rng);
      s = act(s, seat, a, r, T0 + i * 1000).state;
    }
  });

  it("Medium beats Easy most of the time (20 games, colours alternating)", () => {
    let score = 0;
    for (let game = 0; game < 20; game++) {
      const rng = seededRng(`m-v-e-${game}`);
      let s = start(r, game % 2);
      // Seat 0 is Medium.
      for (let i = 0; i < 400 && !s.result; i++) {
        const seat = draughts.currentSeats(s)[0] as SeatIndex;
        const bot = seat === 0 ? draughts.bots.medium : draughts.bots.easy;
        s = act(s, seat, bot(s, seat, r, rng), r, T0 + i * 1000).state;
      }
      const ranking = draughts.ranking(s);
      if (ranking.length === 1 || !s.result) score += 0.5;
      else if (ranking[0]?.[0] === 0) score += 1;
    }
    expect(score / 20).toBeGreaterThan(0.6);
  });

  it("budgets: Easy and Medium stay within their position counts", () => {
    const rng = seededRng("budget");
    const g = geometry(N);
    const gr = genRules(r);
    const b = startBoard(N);
    expect(searchMove(b, g, gr, 1, EASY, rng).nodes).toBeLessThanOrEqual(EASY.budget + 1);
    expect(searchMove(b, g, gr, 1, MEDIUM, rng).nodes).toBeLessThanOrEqual(MEDIUM.budget + 1);
  });
});

describe("draughts properties", () => {
  const variants: DraughtsRules[] = [
    rules(),
    rules({ captureRule: "majority" }),
    rules({ missedCapture: "huff" }),
    draughtsEnglish,
  ];

  test.prop([fc.integer({ min: 0, max: 3 }), fc.string({ maxLength: 8 })], { numRuns: 1000 })(
    "random games end, pieces only ever go down, and every capture obeys the capture rule",
    (vi, seed) => {
      const r = variants[vi] as DraughtsRules;
      const rng = seededRng(`p-${seed}`);
      let s = start(r, 0, seed);
      let pieces = s.board.filter((v) => v !== 0).length;
      let plies = 0;
      while (!s.result) {
        const seat = draughts.currentSeats(s)[0] as SeatIndex;
        const actions = draughts
          .legalActions(s, seat, r)
          .filter((a) => a.type === "move" || a.type === "huff");
        const a = actions[rng.int(actions.length)] as DraughtsAction;
        if (a.type === "move" && r.captureRule === "majority" && r.variant === "naija10") {
          const caps = gen(
            Int8Array.from(s.board),
            geometry(s.variant),
            genRules({ ...r, captureRule: "free" }),
            s.turn === "light" ? 1 : -1,
          ).map((m) => m.captured.length);
          const mine = legalMoves(s, r).find(
            (m) => m.from === a.from && m.path.join() === a.path.join(),
          );
          expect(mine?.captured.length).toBe(Math.max(0, ...caps));
        }
        s = act(s, seat, a, r, T0 + plies * 1000).state;
        const now = s.board.filter((v) => v !== 0).length;
        expect(now).toBeLessThanOrEqual(pieces);
        pieces = now;
        if (++plies > 3000) throw new Error("game didn't end");
      }
      expect(s.result.reason).not.toBe("aborted");
    },
  );

  test.prop([fc.string({ maxLength: 8 })], { numRuns: 200 })("same seed, same game", (seed) => {
    const r = rules();
    const run = () => {
      const rng = seededRng(seed);
      let s = start(r, 0, seed);
      for (let i = 0; i < 60 && !s.result; i++) {
        const seat = draughts.currentSeats(s)[0] as SeatIndex;
        s = act(s, seat, draughts.bots.easy(s, seat, r, rng), r, T0 + i).state;
      }
      return s;
    };
    expect(run()).toEqual(run());
  });
});
