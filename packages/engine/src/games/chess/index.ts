import { Chess } from "chess.js";
import { err, ok } from "../../result";
import type { GameDefinition, GameEvent, RuleErrorCode } from "../../types";
import { botMove, EASY, EASY_PLUS } from "./bots";
import { Board, toUci } from "./movegen";
import {
  canMate,
  chargeMove,
  flagTime,
  halfmoveClock,
  moveDeadline,
  newClockSide,
  other,
  ply,
  repetitions,
  seatOf,
  sideOf,
  sideToMove,
  START_FEN,
} from "./core";
import { chessNaija, type ChessRules } from "./rules";
import { chessActionSchema, chessRulesSchema } from "./schemas";
import type { ChessAction, ChessEndReason, ChessState, ChessView, Side } from "./state";

const MAX_OFFERS = 3;
/** After a declined draw offer, the same side waits 10 moves (20 plies) to offer again. */
const DRAW_OFFER_GAP_PLIES = 20;
const TAKEBACK_EXPIRES_MS = 20_000;

function end(d: ChessState, winner: Side | null, reason: ChessEndReason, events: GameEvent[]) {
  d.result = { winner, reason };
  d.drawOffer = null;
  d.takeback = null;
  events.push({ type: "game_over", winner, reason });
}

/** Result of the position just reached, if the game is over (checkmate comes before draw counts). */
function verdict(
  c: Chess,
  d: ChessState,
  rules: ChessRules,
): { winner: Side | null; reason: ChessEndReason } | null {
  // "No legal moves" from our generator: chess.js's isCheckmate/isStalemate each rebuild its
  // whole move list (with SAN), several ms a move on a Worker.
  if (Board.fromFen(d.fen).moves().length === 0)
    return c.inCheck()
      ? { winner: other(sideToMove(d.fen)), reason: "checkmate" }
      : { winner: null, reason: "stalemate" };
  if (c.isInsufficientMaterial()) return { winner: null, reason: "insufficient" };
  const reps = repetitions(d);
  if (reps >= 5) return { winner: null, reason: "fivefold" };
  if (halfmoveClock(d.fen) >= 150) return { winner: null, reason: "seventyfive" };
  if (rules.drawClaims === "auto") {
    if (reps >= 3) return { winner: null, reason: "threefold" };
    if (halfmoveClock(d.fen) >= 100) return { winner: null, reason: "fifty" };
  }
  return null;
}

const claimable = (d: ChessState) => repetitions(d) >= 3 || halfmoveClock(d.fen) >= 100;

function draft(s: ChessState): ChessState {
  return {
    ...s,
    history: [...s.history],
    moves: [...s.moves],
    san: [...s.san],
    clock: s.clock ? { w: { ...s.clock.w }, b: { ...s.clock.b } } : null,
    drawDeclinedAt: { ...s.drawDeclinedAt },
    offersUsed: { draw: { ...s.offersUsed.draw }, takeback: { ...s.offersUsed.takeback } },
  };
}

/** The side with time left wins on a flag, unless it can't mate at all. */
function flagged(d: ChessState, events: GameEvent[]) {
  const loser = sideToMove(d.fen);
  const winner = other(loser);
  events.push({ type: "flagged", side: loser });
  if (canMate(d.fen, winner)) end(d, winner, "timeout", events);
  else end(d, null, "timeout_vs_insufficient", events);
}

function playMove(
  d: ChessState,
  side: Side,
  action: Extract<ChessAction, { type: "move" }>,
  rules: ChessRules,
  now: number,
  events: GameEvent[],
): RuleErrorCode | null {
  // A move that arrives after the flag loses on time (the server's clock decides).
  const flagAt = flagTime(d);
  if (flagAt !== null && now >= flagAt) {
    flagged(d, events);
    return null;
  }
  const c = new Chess(d.fen);
  let move;
  try {
    move = c.move({
      from: action.uci.slice(0, 2),
      to: action.uci.slice(2, 4),
      promotion: action.uci[4],
    });
  } catch {
    return "ILLEGAL_MOVE";
  }
  // chess.js ignores a promotion letter on a non-promoting move; we don't accept one.
  if (action.uci.length === 5 && !move.promotion) return "ILLEGAL_MOVE";

  const before = ply(d);
  if (d.clock && before >= 2 && d.turnStartedAt !== null) {
    const inc = (rules.timeControl?.incrementSeconds ?? 0) * 1000;
    d.clock[side] = chargeMove(d.clock[side], now - d.turnStartedAt, action.mt, inc);
  }
  d.fen = c.fen();
  d.history.push(d.fen);
  d.moves.push(move.lan);
  d.san.push(move.san);
  // Clocks start once both sides have made their first move.
  d.turnStartedAt = now;
  if (d.drawOffer && d.drawOffer.by !== side) {
    events.push({ type: "draw_declined", by: other(side) });
    d.drawOffer = null;
  }
  if (d.takeback) {
    events.push({ type: "takeback_declined" });
    d.takeback = null;
  }
  events.push({
    type: "moved",
    side,
    uci: move.lan,
    san: move.san,
    capture: !!move.captured,
    castle: move.isKingsideCastle() || move.isQueensideCastle(),
    promotion: move.promotion ?? null,
    check: c.inCheck(),
  });
  const v = verdict(c, d, rules);
  if (v) end(d, v.winner, v.reason, events);
  return null;
}

/** Undo back to the requester's last move (and the reply to it, if any): their turn again. */
function takeBack(d: ChessState, by: Side, now: number) {
  const lastMover = other(sideToMove(d.fen));
  const plies = lastMover === by ? 1 : 2;
  for (let i = 0; i < plies; i++) {
    d.history.pop();
    d.moves.pop();
    d.san.pop();
  }
  d.fen = d.history.at(-1) as string;
  // Clock times aren't given back; the side now to move starts afresh from here.
  d.turnStartedAt = ply(d) === 0 ? null : now;
  if (ply(d) === 0) d.startedAt = now;
  return plies;
}

export const chess: GameDefinition<ChessState, ChessAction, ChessView, ChessRules> = {
  slug: "chess",
  minPlayers: 2,
  maxPlayers: 2,
  presets: { naija: chessNaija },
  ruleSchema: chessRulesSchema,
  actionSchema: chessActionSchema,

  setup(_players, { rules, now }, first = 0) {
    const tc = rules.timeControl;
    return {
      white: first,
      fen: START_FEN,
      history: [START_FEN],
      moves: [],
      san: [],
      startedAt: now,
      turnStartedAt: null,
      clock: tc ? { w: newClockSide(tc), b: newClockSide(tc) } : null,
      drawOffer: null,
      drawDeclinedAt: { w: null, b: null },
      takeback: null,
      offersUsed: { draw: { w: 0, b: 0 }, takeback: { w: 0, b: 0 } },
      result: null,
    };
  },

  currentSeats: (s) => (s.result ? [] : [seatOf(s, sideToMove(s.fen))]),

  legalActions(s, seat, rules) {
    if (s.result) return [];
    const side = sideOf(s, seat);
    const out: ChessAction[] = [{ type: "resign" }];
    if (ply(s) < 2) out.push({ type: "abort" });
    if (s.drawOffer?.by === other(side))
      out.push({ type: "accept_draw" }, { type: "decline_draw" });
    else if (canOfferDraw(s, side)) out.push({ type: "offer_draw" });
    if (s.takeback?.by === other(side))
      out.push({ type: "accept_takeback" }, { type: "decline_takeback" });
    else if (canRequestTakeback(s, side, rules)) out.push({ type: "request_takeback" });
    if (rules.drawClaims === "claim" && claimable(s)) out.push({ type: "claim_draw" });
    // Our generator (perft-checked against chess.js) is much faster than chess.js's verbose list.
    if (sideToMove(s.fen) === side)
      for (const m of Board.fromFen(s.fen).moves()) out.push({ type: "move", uci: toUci(m) });
    return out;
  },

  apply(s, { seat, action }, { rules, now }) {
    if (s.result) return err("GAME_OVER");
    if (seat !== s.white && seat !== (s.white + 1) % 2) return err("BAD_ACTION");
    const side = sideOf(s, seat);
    const d = draft(s);
    const events: GameEvent[] = [];
    const toMove = sideToMove(s.fen);

    switch (action.type) {
      case "move": {
        if (toMove !== side) return err("NOT_YOUR_TURN");
        const e = playMove(d, side, action, rules, now, events);
        return e ? err(e) : ok(d, events);
      }
      case "flag": {
        // Applied by the room once `turnDeadline` has passed.
        if (ply(s) < 2) {
          end(d, null, "aborted", events);
          return ok(d, events);
        }
        const due = moveDeadline(s, rules);
        if (due === null || now < due) return err("NOT_ALLOWED");
        if (!s.clock) return err("NOT_ALLOWED"); // no clock: the room plays a move instead
        flagged(d, events);
        return ok(d, events);
      }
      case "resign":
        end(d, other(side), "resign", events);
        return ok(d, events);
      case "abort":
        if (ply(s) >= 2) return err("NOT_ALLOWED");
        end(d, null, "aborted", events);
        return ok(d, events);
      case "offer_draw":
        if (!canOfferDraw(s, side)) return err("NOT_ALLOWED");
        d.drawOffer = { by: side, atPly: ply(s) };
        d.offersUsed.draw[side]++;
        events.push({ type: "draw_offered", by: side });
        return ok(d, events);
      case "accept_draw":
        if (s.drawOffer?.by !== other(side)) return err("NOT_ALLOWED");
        end(d, null, "agreement", events);
        return ok(d, events);
      case "decline_draw":
        if (s.drawOffer?.by !== other(side)) return err("NOT_ALLOWED");
        d.drawDeclinedAt[other(side)] = ply(s);
        d.drawOffer = null;
        events.push({ type: "draw_declined", by: side });
        return ok(d, events);
      case "claim_draw": {
        if (rules.drawClaims !== "claim" || !claimable(s)) return err("NOT_ALLOWED");
        end(d, null, repetitions(s) >= 3 ? "threefold" : "fifty", events);
        return ok(d, events);
      }
      case "request_takeback":
        if (!canRequestTakeback(s, side, rules)) return err("NOT_ALLOWED");
        d.takeback = { by: side, atPly: ply(s), expiresAt: now + TAKEBACK_EXPIRES_MS };
        d.offersUsed.takeback[side]++;
        events.push({ type: "takeback_requested", by: side });
        return ok(d, events);
      case "accept_takeback": {
        const t = s.takeback;
        if (!t || t.by !== other(side) || now > t.expiresAt || t.atPly !== ply(s))
          return err("NOT_ALLOWED");
        d.takeback = null;
        d.drawOffer = null;
        const plies = takeBack(d, t.by, now);
        events.push({ type: "takeback_done", plies });
        return ok(d, events);
      }
      case "decline_takeback":
        if (s.takeback?.by !== other(side)) return err("NOT_ALLOWED");
        d.takeback = null;
        events.push({ type: "takeback_declined" });
        return ok(d, events);
      default:
        return err("BAD_ACTION");
    }
  },

  turnDeadline: (s, seat, rules) =>
    !s.result && seatOf(s, sideToMove(s.fen)) === seat ? moveDeadline(s, rules) : null,

  // Out of time: clocked games (and the abort window) flag; "No clock" games get a move made.
  timeoutAction(s, _seat, rules, rng) {
    if (ply(s) < 2 || s.clock) return { type: "flag" };
    const uci = botMove(s.fen, EASY, rng);
    return uci ? { type: "move", uci } : { type: "flag" };
  },

  autoAdvance: () => null,

  // Bots take back when asked and keep playing for a result (they decline draws).
  botReply(s, seat) {
    if (s.result) return null;
    const side = sideOf(s, seat);
    if (s.takeback?.by === other(side)) return { type: "accept_takeback" };
    if (s.drawOffer?.by === other(side)) return { type: "decline_draw" };
    return null;
  },

  aborted: (s) => s.result?.reason === "aborted",

  // About a second a move, like a quick human (Best, Oct 2026: 1–4 % of the clock, up to 12 s
  // at the start of a 5-minute game, felt slow). Quicker when short of time, so bots don't flag.
  // The bot service's own search (0.1–0.2 s) and the network come on top.
  botThinkMs(s) {
    const left = s.clock && ply(s) >= 2 ? s.clock[sideToMove(s.fen)].remainingMs : Infinity;
    if (left < 20_000) return [150, 400];
    if (left < 60_000) return [300, 800];
    return [500, 1500];
  },

  view: (s, viewer): ChessView => ({
    ...s,
    you: viewer === "spectator" ? null : sideOf(s, viewer),
  }),

  isOver: (s) => s.result !== null,
  ranking(s) {
    const r = s.result;
    if (!r || r.reason === "aborted") return [];
    const w = seatOf(s, "w");
    const b = seatOf(s, "b");
    if (r.winner === null) return [[w, b]];
    return r.winner === "w" ? [[w], [b]] : [[b], [w]];
  },

  bots: {
    easy: (s, _seat, _rules, rng) => ({ type: "move", uci: botMove(s.fen, EASY, rng) ?? "a1a1" }),
    // Medium and Hard come from the bot service; this is their built-in fallback ("Easy+").
    medium: (s, _seat, _rules, rng) => ({
      type: "move",
      uci: botMove(s.fen, EASY_PLUS, rng) ?? "a1a1",
    }),
    hard: (s, _seat, _rules, rng) => ({
      type: "move",
      uci: botMove(s.fen, EASY_PLUS, rng) ?? "a1a1",
    }),
  },
};

function canOfferDraw(s: ChessState, side: Side): boolean {
  if (s.drawOffer || ply(s) < 2) return false;
  if (s.offersUsed.draw[side] >= MAX_OFFERS) return false;
  const declined = s.drawDeclinedAt[side];
  return declined === null || ply(s) - declined >= DRAW_OFFER_GAP_PLIES;
}

function canRequestTakeback(s: ChessState, side: Side, rules: ChessRules): boolean {
  if (!rules.takebacks || s.takeback) return false;
  if (s.offersUsed.takeback[side] >= MAX_OFFERS) return false;
  // You need a move of your own to take back.
  return s.moves.length >= (side === "w" ? 1 : 2);
}

export { chessNaija, type ChessRules } from "./rules";
export { chessRulesSchema } from "./schemas";
export type { ChessAction, ChessState, ChessView, Side } from "./state";
