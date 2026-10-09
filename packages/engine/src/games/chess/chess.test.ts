import { fc, test } from "@fast-check/vitest";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import type { SeatIndex } from "../../types";
import { botMove, EASY, EASY_PLUS } from "./bots";
import { chargeMove, flagTime, initLag, material, repetitions } from "./core";
import { chess, chessNaija, type ChessRules, type ChessState } from "./index";
import type { ChessAction } from "./state";

const rules = (r: Partial<ChessRules> = {}): ChessRules => ({ ...chessNaija, ...r });
const T0 = 1_000_000;
const start = (r: ChessRules, first = 0) =>
  chess.setup(2, { rng: seededRng("c"), rules: r, now: T0 }, first);

function act(s: ChessState, seat: SeatIndex, action: ChessAction, r: ChessRules, now = T0) {
  const res = chess.apply(s, { seat, action }, { rng: seededRng("a"), rules: r, now });
  if (!res.ok) throw new Error(`${seat} ${JSON.stringify(action)}: ${res.error}`);
  return res;
}
const reject = (s: ChessState, seat: SeatIndex, action: ChessAction, r: ChessRules, now = T0) => {
  const res = chess.apply(s, { seat, action }, { rng: seededRng("a"), rules: r, now });
  return res.ok ? null : res.error;
};
/** Plays UCI moves alternately (White = seat 0), `step` ms apart. */
function play(s: ChessState, ucis: string[], r: ChessRules, now = T0, step = 1000) {
  let st = s;
  let t = now;
  for (const uci of ucis) {
    t += step;
    const seat = st.fen.split(" ")[1] === "w" ? st.white : 1 - st.white;
    st = act(st, seat, { type: "move", uci }, r, t).state;
  }
  return { s: st, t };
}
/** A position set up from a FEN, as if reached in play. */
const at = (fen: string, r: ChessRules, plies = 10): ChessState => {
  const s = start(r);
  return {
    ...s,
    fen,
    history: [fen],
    moves: Array(plies).fill("e2e4"),
    san: Array(plies).fill("e4"),
    turnStartedAt: T0,
  };
};

describe("chess setup and moves", () => {
  it("the first seat plays White; a 5+3 clock starts at 5:00 each with lichess lag quotas", () => {
    const s = start(rules(), 1);
    expect(s.white).toBe(1);
    expect(chess.currentSeats(s)).toEqual([1]);
    expect(s.clock?.w).toEqual({
      remainingMs: 300_000,
      lag: { gain: 1000, quota: 3000, max: 7000 },
    });
    expect(initLag({ baseSeconds: 60, incrementSeconds: 0 })).toEqual({
      gain: 390,
      quota: 1170,
      max: 2730,
    });
    expect(start(rules({ timeControl: null })).clock).toBeNull();
  });

  it("legal moves only, on your own turn; a promotion letter must mean a promotion", () => {
    const r = rules();
    const s = start(r);
    expect(reject(s, 1, { type: "move", uci: "e7e5" }, r)).toBe("NOT_YOUR_TURN");
    expect(reject(s, 0, { type: "move", uci: "e2e5" }, r)).toBe("ILLEGAL_MOVE");
    expect(reject(s, 0, { type: "move", uci: "e2e4q" }, r)).toBe("ILLEGAL_MOVE");
    const { state, events } = act(s, 0, { type: "move", uci: "e2e4" }, r);
    expect(state.san).toEqual(["e4"]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "moved", san: "e4", capture: false }),
    );
  });

  it("promotes to the piece asked for", () => {
    const r = rules();
    const s = at("8/4P1k1/8/8/8/8/8/4K3 w - - 0 1", r);
    const after = act(s, 0, { type: "move", uci: "e7e8n" }, r).state;
    expect(after.fen.startsWith("4N3/")).toBe(true);
  });
});

describe("chess clocks", () => {
  it("lag maths: honest, premove, no mt, and a client that always claims 0", () => {
    const side = { remainingMs: 300_000, lag: { gain: 1000, quota: 3000, max: 7000 } };
    // 5 s on the server, 4 s by the client: 1 s of lag forgiven, quota refills to 3 s; +3 s increment.
    expect(chargeMove(side, 5000, 4000, 3000)).toEqual({
      remainingMs: 299_000,
      lag: { ...side.lag, quota: 3000 },
    });
    // Premove: 150 ms in flight, all forgiven.
    expect(chargeMove(side, 150, 0, 3000).remainingMs).toBe(303_000);
    // No think time sent: no lag assumed, quota grows (capped at max).
    expect(chargeMove(side, 5000, undefined, 0)).toEqual({
      remainingMs: 295_000,
      lag: { ...side.lag, quota: 4000 },
    });
    // Always claiming 0: forgiven at most the quota, which then drains.
    expect(chargeMove(side, 5000, 0, 0)).toEqual({
      remainingMs: 298_000,
      lag: { ...side.lag, quota: 1000 },
    });
  });

  it("clocks start after both first moves; increment is added after each move", () => {
    const r = rules();
    const { s, t } = play(start(r), ["e2e4", "e7e5"], r, T0, 10_000);
    expect(s.clock?.w.remainingMs).toBe(300_000);
    expect(s.turnStartedAt).toBe(t);
    const after = act(s, 0, { type: "move", uci: "g1f3" }, r, t + 4000).state;
    expect(after.clock?.w.remainingMs).toBe(299_000); // 300 − 4 + 3
  });

  it("flags at the flag time (with up to 2 s grace); a move after it loses on time", () => {
    const r = rules({ timeControl: { baseSeconds: 60, incrementSeconds: 0 } });
    const { s, t } = play(start(r), ["e2e4", "e7e5"], r);
    const flagAt = flagTime(s) as number;
    expect(flagAt).toBe(t + 60_000 + 1170);
    expect(chess.turnDeadline?.(s, 0, r)).toBe(flagAt);
    expect(chess.turnDeadline?.(s, 1, r)).toBeNull();
    expect(reject(s, 0, { type: "flag" }, r, flagAt - 1)).toBe("NOT_ALLOWED");
    expect(act(s, 0, { type: "flag" }, r, flagAt).state.result).toEqual({
      winner: "b",
      reason: "timeout",
    });
    const late = act(s, 0, { type: "move", uci: "g1f3" }, r, flagAt + 5).state;
    expect([late.result, late.moves.length]).toEqual([{ winner: "b", reason: "timeout" }, 2]);
  });

  it("running out against a lone king is a draw", () => {
    const r = rules({ timeControl: { baseSeconds: 60, incrementSeconds: 0 } });
    // Black (to move, with a pawn) flags; White has only a king left.
    const s = at("4k3/4p3/8/8/8/8/8/4K3 b - - 0 40", r);
    const flagAt = flagTime(s) as number;
    expect(act(s, 1, { type: "flag" }, r, flagAt).state.result).toEqual({
      winner: null,
      reason: "timeout_vs_insufficient",
    });
  });

  it("no first move in the abort window: aborted, no result; abort works until both have moved", () => {
    const r = rules();
    const s = start(r);
    expect(chess.turnDeadline?.(s, 0, r)).toBe(T0 + 30_000);
    expect(chess.timeoutAction(s, 0, r, seededRng("t"))).toEqual({ type: "flag" });
    const aborted = act(s, 0, { type: "flag" }, r, T0 + 30_000).state;
    expect(chess.aborted?.(aborted)).toBe(true);
    expect(chess.ranking(aborted)).toEqual([]);
    const one = play(s, ["e2e4"], r).s;
    expect(act(one, 0, { type: "abort" }, r).state.result?.reason).toBe("aborted");
    const two = play(s, ["e2e4", "e7e5"], r).s;
    expect(reject(two, 0, { type: "abort" }, r)).toBe("NOT_ALLOWED");
  });

  it("no clock: a per-move limit, and running out makes a move for you", () => {
    const r = rules({ timeControl: null });
    const { s, t } = play(start(r), ["e2e4", "e7e5"], r);
    expect(chess.turnDeadline?.(s, 0, r)).toBe(t + 300_000);
    const a = chess.timeoutAction(s, 0, r, seededRng("t"));
    expect(a.type).toBe("move");
    expect(act(s, 0, a, r, t + 300_000).state.moves).toHaveLength(3);
  });
});

describe("chess results", () => {
  it("checkmate wins; ranking puts the winner first", () => {
    const r = rules();
    const s = play(start(r), ["f2f3", "e7e5", "g2g4", "d8h4"], r).s;
    expect(s.result).toEqual({ winner: "b", reason: "checkmate" });
    expect(chess.ranking(s)).toEqual([[1], [0]]);
  });

  it("stalemate and insufficient material are draws", () => {
    const r = rules();
    const stale = act(
      at("7k/8/6Q1/8/8/8/8/K7 w - - 0 1", r),
      0,
      { type: "move", uci: "g6f7" },
      r,
    ).state;
    expect(stale.result).toEqual({ winner: null, reason: "stalemate" });
    // Knight takes the last queen: king and knight against a bare king.
    const bare = act(
      at("7k/8/8/8/8/8/6q1/K3N3 w - - 0 1", r),
      0,
      { type: "move", uci: "e1g2" },
      r,
    ).state;
    expect(bare.result).toEqual({ winner: null, reason: "insufficient" });
    // Bishops on the same colour (b2 and h8 are both dark): dead position.
    const sameColour = new Chess("7b/8/4k3/8/8/8/1B6/4K3 w - - 0 1");
    expect(sameColour.isInsufficientMaterial()).toBe(true);
    expect(chess.ranking(bare)).toEqual([[0, 1]]);
  });

  const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"];

  it("threefold repetition ends it by default; with claims on, there's a Claim draw", () => {
    const auto = play(start(rules()), shuffle, rules()).s;
    expect(auto.result).toEqual({ winner: null, reason: "threefold" });
    const r = rules({ drawClaims: "claim" });
    const s = play(start(r), shuffle, r).s;
    expect(s.result).toBeNull();
    expect(repetitions(s)).toBe(3);
    expect(chess.legalActions(s, 1, r)).toContainEqual({ type: "claim_draw" });
    expect(act(s, 1, { type: "claim_draw" }, r).state.result).toEqual({
      winner: null,
      reason: "threefold",
    });
    const five = play(s, shuffle, r).s;
    expect(five.result?.reason).toBe("fivefold");
  });

  it("50 moves end it by default (or can be claimed); 75 always end it", () => {
    const fen = (n: number) => `4k3/8/8/8/8/8/8/R3K3 w - - ${n} 60`;
    const auto = act(at(fen(99), rules()), 0, { type: "move", uci: "a1a2" }, rules()).state;
    expect(auto.result).toEqual({ winner: null, reason: "fifty" });
    const r = rules({ drawClaims: "claim" });
    expect(act(at(fen(99), r), 0, { type: "move", uci: "a1a2" }, r).state.result).toBeNull();
    expect(act(at(fen(149), r), 0, { type: "move", uci: "a1a2" }, r).state.result).toEqual({
      winner: null,
      reason: "seventyfive",
    });
  });

  it("resigning loses at any point", () => {
    const r = rules();
    expect(act(start(r), 0, { type: "resign" }, r).state.result).toEqual({
      winner: "b",
      reason: "resign",
    });
  });
});

describe("chess draw offers and takebacks", () => {
  const r = rules();
  const opening = () => play(start(r), ["e2e4", "e7e5"], r);

  it("offer, accept: a draw by agreement; the opponent moving declines it", () => {
    const { s } = opening();
    const offered = act(s, 1, { type: "offer_draw" }, r).state; // not their turn: fine
    expect(act(offered, 0, { type: "accept_draw" }, r).state.result).toEqual({
      winner: null,
      reason: "agreement",
    });
    const moved = act(offered, 0, { type: "move", uci: "g1f3" }, r).state;
    expect(moved.drawOffer).toBeNull();
    // The offerer moving keeps their offer open.
    const own = act(
      act(s, 0, { type: "offer_draw" }, r).state,
      0,
      { type: "move", uci: "g1f3" },
      r,
    ).state;
    expect(own.drawOffer?.by).toBe("w");
  });

  it("after a decline, 10 moves before offering again; at most 3 offers", () => {
    const { s } = opening();
    const declined = act(
      act(s, 0, { type: "offer_draw" }, r).state,
      1,
      { type: "decline_draw" },
      r,
    ).state;
    expect(reject(declined, 0, { type: "offer_draw" }, r)).toBe("NOT_ALLOWED");
    // 20 plies of development, no position repeated.
    const develop = [
      "g1f3",
      "g8f6",
      "b1c3",
      "b8c6",
      "f1c4",
      "f8c5",
      "d2d3",
      "d7d6",
      "c1g5",
      "c8g4",
    ];
    const more = ["h2h3", "h7h6", "g5h4", "g4h5", "a2a3", "a7a6", "b2b4", "b7b5", "c4b3", "c5b6"];
    let later = play(declined, [...develop, ...more], r).s;
    expect(later.result).toBeNull();
    later = act(later, 0, { type: "offer_draw" }, r).state;
    expect(later.offersUsed.draw.w).toBe(2);
  });

  it("takeback: undoes your move (and the reply), expires after 20 s, and needs the rule on", () => {
    const { s, t } = opening();
    // Black asks right after its own move: one ply back.
    const asked = act(s, 1, { type: "request_takeback" }, r, t).state;
    const back = act(asked, 0, { type: "accept_takeback" }, r, t + 5000).state;
    expect([back.moves, back.fen.split(" ")[1]]).toEqual([["e2e4"], "b"]);
    // White asks after Black replied: two plies back, White to move again.
    const w = act(s, 0, { type: "request_takeback" }, r, t).state;
    const backW = act(w, 1, { type: "accept_takeback" }, r, t + 1000).state;
    expect(backW.moves).toEqual([]);
    expect(reject(w, 1, { type: "accept_takeback" }, r, t + 20_001)).toBe("NOT_ALLOWED");
    expect(reject(s, 0, { type: "request_takeback" }, rules({ takebacks: false }))).toBe(
      "NOT_ALLOWED",
    );
    expect(reject(start(r), 0, { type: "request_takeback" }, r)).toBe("NOT_ALLOWED");
  });

  it("bots answer: they accept takebacks and decline draws", () => {
    const { s } = opening();
    expect(chess.botReply?.(act(s, 0, { type: "request_takeback" }, r).state, 1, r)).toEqual({
      type: "accept_takeback",
    });
    expect(chess.botReply?.(act(s, 0, { type: "offer_draw" }, r).state, 1, r)).toEqual({
      type: "decline_draw",
    });
    expect(chess.botReply?.(s, 1, r)).toBeNull();
  });
});

describe("chess bot pace", () => {
  it("about a second a move, quicker when the bot is short of time", () => {
    const r = rules();
    const { s } = play(start(r), ["e2e4", "e7e5"], r);
    expect(chess.botThinkMs?.(s, { type: "resign" })).toEqual([500, 1500]);
    const low = { ...s, clock: { ...s.clock!, w: { ...s.clock!.w, remainingMs: 15_000 } } };
    expect(chess.botThinkMs?.(low, { type: "resign" })).toEqual([150, 400]);
  });
});

describe("chess view and material", () => {
  it("everyone sees the board; you learn your colour", () => {
    const s = start(rules(), 1);
    expect(chess.view(s, 1).you).toBe("w");
    expect(chess.view(s, 0).you).toBe("b");
    expect(chess.view(s, "spectator").you).toBeNull();
  });

  it("captured pieces and the material lead come from the board", () => {
    const m = material("rnb1kbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 0 3");
    expect(m.captured).toEqual({ w: ["q"], b: ["q"] });
    expect(material("rnbqkbnr/pppp1ppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3").lead).toEqual({
      w: 0,
      b: 0,
    });
    expect(material("rnbqkbnr/pppp1ppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 3").lead).toEqual({
      w: 1,
      b: 0,
    });
  });
});

describe("chess bots", () => {
  it("Easy+ takes a free queen and finds mate in one", () => {
    expect(botMove("4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1", EASY_PLUS, seededRng("b"))).toBe("d2d5");
    expect(botMove("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", EASY_PLUS, seededRng("b"))).toBe("a1a8");
  });

  it("Easy answers a busy middlegame with a legal move", () => {
    const fen = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
    const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.lan);
    for (let i = 0; i < 5; i++) expect(legal).toContain(botMove(fen, EASY, seededRng(`e${i}`)));
  });

  it("bots only play legal moves, within their position budget", () => {
    const rng = seededRng("bots");
    const r = rules({ timeControl: null });
    let s = start(r);
    for (let i = 0; i < 80 && !s.result; i++) {
      const seat = chess.currentSeats(s)[0] as number;
      const a = chess.bots[i % 2 ? "easy" : "hard"](s, seat, r, rng);
      s = act(s, seat, a, r, T0 + i * 1000).state;
    }
    expect(s.moves.length).toBeGreaterThan(10);
  });
});

// ── Properties ───────────────────────────────────────────────────────────────

const rulesArb = fc.record({
  turnSeconds: fc.constant(30),
  timeControl: fc.constantFrom(
    null,
    { baseSeconds: 60, incrementSeconds: 0 },
    { baseSeconds: 300, incrementSeconds: 3 },
  ),
  moveLimitSeconds: fc.constant(300),
  drawClaims: fc.constantFrom("auto" as const, "claim" as const),
  takebacks: fc.boolean(),
  premoves: fc.constant(true),
  abortSeconds: fc.constant(30),
  autoQueenPremove: fc.constant(true),
});

/** A random game: mostly moves, now and then an offer, takeback or answer. */
function randomGame(r: ChessRules, seed: string, maxPlies = 400) {
  const rng = seededRng(seed);
  let s = start(r, rng.int(2));
  let now = T0;
  for (let i = 0; i < maxPlies * 2 && !s.result; i++) {
    now += 500;
    const seat = rng.int(6) === 0 ? rng.int(2) : (chess.currentSeats(s)[0] as number);
    const legal = chess
      .legalActions(s, seat, r)
      .filter((a) => a.type !== "resign" && a.type !== "abort");
    if (!legal.length) continue;
    const moves = legal.filter((a) => a.type === "move");
    const pool = moves.length && rng.int(10) > 0 ? moves : legal;
    const res = chess.apply(
      s,
      { seat, action: pool[rng.int(pool.length)] as ChessAction },
      { rng, rules: r, now },
    );
    if (!res.ok) throw new Error(`legal action rejected: ${res.error}`);
    s = res.state;
    // Plain checks (not expect) on every step.
    if (s.history.length !== s.moves.length + 1 || s.san.length !== s.moves.length)
      throw new Error("history out of step");
    if (s.history.at(-1) !== s.fen) throw new Error("fen not last in history");
  }
  return s;
}

describe("chess properties", () => {
  test.prop([rulesArb, fc.string({ minLength: 1, maxLength: 8 })], { numRuns: 12 })(
    "replaying the moves from the start gives the same position; actions never break it",
    (r, seed) => {
      const s = randomGame(r, seed, 200);
      const replay = new Chess();
      for (const uci of s.moves)
        replay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      expect(replay.fen()).toBe(s.fen);
    },
  );

  test.prop([rulesArb, fc.string({ minLength: 1, maxLength: 8 })], { numRuns: 8 })(
    "same seed, same game",
    (r, seed) => {
      expect(randomGame(r, seed, 80)).toEqual(randomGame(r, seed, 80));
    },
  );

  test.prop([rulesArb, fc.string({ minLength: 1, maxLength: 8 })], { numRuns: 30 })(
    "anything outside legalActions is refused",
    (r, seed) => {
      const s = randomGame(r, seed, 30);
      if (s.result) return;
      const seat = chess.currentSeats(s)[0] as number;
      const legal = new Set(chess.legalActions(s, seat, r).map((a) => JSON.stringify(a)));
      for (const uci of ["e2e4", "a7a5", "e1g1", "h2h8", "a1a1", "e7e8q"])
        if (!legal.has(JSON.stringify({ type: "move", uci })))
          expect(reject(s, seat, { type: "move", uci }, r, T0 + 10_000)).not.toBeNull();
    },
  );
});
