import { err, ok } from "../../result";
import type { GameDefinition, GameEvent, Rng, RuleErrorCode } from "../../types";
import { chargeMove, newClockSide } from "../clock";
import {
  captures,
  decode,
  encode,
  genRules,
  geometry,
  legalMoves as gen,
  play,
  sameMove,
  startBoard,
} from "./board";
import { EASY, MEDIUM, searchMove, type BotStyle } from "./bots";
import {
  colourOf,
  drawByRule,
  flagTime,
  moveDeadline,
  notation,
  other,
  ply,
  seatOf,
  signOf,
  toInternal,
  toPublic,
} from "./core";
import { draughtsEnglish, draughtsNaija, effective, type DraughtsRules } from "./rules";
import { draughtsActionSchema, draughtsRulesSchema } from "./schemas";
import type {
  Colour,
  DraughtsAction,
  DraughtsEndReason,
  DraughtsState,
  DraughtsView,
} from "./state";

const MAX_OFFERS = 3;
/** After a declined draw offer, the same side waits 10 moves (20 plies) to offer again. */
const DRAW_OFFER_GAP_PLIES = 20;
const TAKEBACK_EXPIRES_MS = 20_000;

const setupFor = (s: Pick<DraughtsState, "variant">, rules: DraughtsRules) =>
  genRules(effective({ ...rules, variant: s.variant }));

function end(
  d: DraughtsState,
  winner: Colour | null,
  reason: DraughtsEndReason,
  events: GameEvent[],
) {
  d.result = { winner, reason };
  d.drawOffer = null;
  d.takeback = null;
  d.huffable = null;
  events.push({ type: "game_over", winner, reason });
}

/** Result of the position just reached, if the game is over: the side to move lost, or a draw. */
function verdict(d: DraughtsState, rules: DraughtsRules) {
  const sign = signOf(d.turn);
  if (!d.board.some((v) => v * sign > 0))
    return { winner: other(d.turn), reason: "no_pieces" as const };
  const b = Int8Array.from(d.board);
  if (!gen(b, geometry(d.variant), setupFor(d, rules), sign).length)
    return { winner: other(d.turn), reason: "blocked" as const };
  const draw = drawByRule(d, rules);
  return draw ? { winner: null, reason: draw } : null;
}

function draft(s: DraughtsState): DraughtsState {
  return {
    ...s,
    board: [...s.board],
    history: [...s.history],
    moves: [...s.moves],
    clock: s.clock ? { light: { ...s.clock.light }, dark: { ...s.clock.dark } } : null,
    drawDeclinedAt: { ...s.drawDeclinedAt },
    offersUsed: { draw: { ...s.offersUsed.draw }, takeback: { ...s.offersUsed.takeback } },
  };
}

function playMove(
  d: DraughtsState,
  side: Colour,
  action: Extract<DraughtsAction, { type: "move" }>,
  rules: DraughtsRules,
  now: number,
  events: GameEvent[],
): RuleErrorCode | null {
  // A move that arrives after the flag loses on time (the server's clock decides).
  const flagAt = flagTime(d);
  if (flagAt !== null && now >= flagAt) {
    events.push({ type: "flagged", side });
    end(d, other(side), "timeout", events);
    return null;
  }
  const g = geometry(d.variant);
  const r = setupFor(d, rules);
  const b = Int8Array.from(d.board);
  const sign = signOf(side);
  const wanted = toInternal(action);
  const move = gen(b, g, r, sign).find((m) => sameMove(m, wanted));
  if (!move) return "ILLEGAL_MOVE";

  // Huffing option: a seed that could have captured but didn't may be blown by the other side.
  let huffable: number[] = [];
  if (!r.forced && !move.captured.length) {
    const to = move.path[move.path.length - 1] as number;
    const could = new Set(captures(b, g, r, sign).map((m) => (m.from === move.from ? to : m.from)));
    huffable = [...could].map((x) => x + 1);
  }

  if (d.clock && ply(d) >= 2 && d.turnStartedAt !== null) {
    const inc = (rules.timeControl?.incrementSeconds ?? 0) * 1000;
    d.clock[side] = chargeMove(d.clock[side], now - d.turnStartedAt, action.mt, inc);
  }
  const crowned = play(b, g, move);
  const pub = toPublic(move);
  d.board = Array.from(b);
  d.turn = other(side);
  d.history.push(encode(b));
  d.moves.push(pub);
  d.turnStartedAt = now;
  d.huffable = huffable.length ? { by: other(side), squares: huffable } : null;
  if (d.drawOffer && d.drawOffer.by !== side) {
    events.push({ type: "draw_declined", by: other(side) });
    d.drawOffer = null;
  }
  if (d.takeback) {
    events.push({ type: "takeback_declined" });
    d.takeback = null;
  }
  events.push({ type: "moved", side, ...pub, notation: notation(pub), crowned });
  const v = verdict(d, rules);
  if (v) end(d, v.winner, v.reason, events);
  return null;
}

/** Undo back to the requester's last move (and the reply to it, if any): their turn again. */
function takeBack(d: DraughtsState, by: Colour, now: number) {
  const lastMover = other(d.turn);
  const plies = lastMover === by ? 1 : 2;
  for (let i = 0; i < plies; i++) {
    d.history.pop();
    d.moves.pop();
    d.turn = other(d.turn);
  }
  d.board = Array.from(decode(d.history.at(-1) as string));
  d.huffable = null;
  // Clock times aren't given back; the side now to move starts afresh from here.
  d.turnStartedAt = ply(d) === 0 ? null : now;
  if (ply(d) === 0) d.startedAt = now;
  return plies;
}

/** A bot's move, as an action: huff first when it may (a king if there is one), then search. */
function botAction(
  s: DraughtsState,
  rules: DraughtsRules,
  style: BotStyle,
  rng: Rng,
): DraughtsAction {
  if (s.huffable?.by === s.turn) {
    const squares = s.huffable.squares;
    const king = squares.find((sq) => Math.abs(s.board[sq - 1] as number) === 2);
    return { type: "huff", square: king ?? (squares[rng.int(squares.length)] as number) };
  }
  const { move } = searchMove(
    Int8Array.from(s.board),
    geometry(s.variant),
    setupFor(s, rules),
    signOf(s.turn),
    style,
    rng,
  );
  // No move means the game is already over; apply() refuses this.
  return move ? { type: "move", ...pick(toPublic(move)) } : { type: "move", from: 1, path: [1] };
}

const pick = (m: { from: number; path: number[] }) => ({ from: m.from, path: m.path });

export const draughts: GameDefinition<DraughtsState, DraughtsAction, DraughtsView, DraughtsRules> =
  {
    slug: "draughts",
    minPlayers: 2,
    maxPlayers: 2,
    presets: { naija: draughtsNaija, english: draughtsEnglish },
    ruleSchema: draughtsRulesSchema,
    actionSchema: draughtsActionSchema,

    // `first` moves first; the rules say which colour that is (lots are drawn by default).
    setup(players, { rules, now, rng }, first = 0) {
      const r = effective(rules);
      const firstColour: Colour =
        r.firstMove === "random" ? (rng.int(2) === 0 ? "light" : "dark") : r.firstMove;
      const tc = rules.timeControl;
      const board = startBoard(r.variant);
      return {
        variant: r.variant,
        light: firstColour === "light" ? first : (first + 1) % Math.max(players, 2),
        board: Array.from(board),
        turn: firstColour,
        history: [encode(board)],
        moves: [],
        startedAt: now,
        turnStartedAt: null,
        clock: tc ? { light: newClockSide(tc), dark: newClockSide(tc) } : null,
        huffable: null,
        drawOffer: null,
        drawDeclinedAt: { light: null, dark: null },
        takeback: null,
        offersUsed: { draw: { light: 0, dark: 0 }, takeback: { light: 0, dark: 0 } },
        result: null,
      };
    },

    currentSeats: (s) => (s.result ? [] : [seatOf(s, s.turn)]),

    legalActions(s, seat, rules) {
      if (s.result) return [];
      const side = colourOf(s, seat);
      const out: DraughtsAction[] = [{ type: "resign" }];
      if (ply(s) < 2) out.push({ type: "abort" });
      if (s.drawOffer?.by === other(side))
        out.push({ type: "accept_draw" }, { type: "decline_draw" });
      else if (canOfferDraw(s, side)) out.push({ type: "offer_draw" });
      if (s.takeback?.by === other(side))
        out.push({ type: "accept_takeback" }, { type: "decline_takeback" });
      else if (canRequestTakeback(s, side, rules)) out.push({ type: "request_takeback" });
      if (s.turn === side) {
        if (s.huffable?.by === side)
          for (const square of s.huffable.squares) out.push({ type: "huff", square });
        const moves = gen(
          Int8Array.from(s.board),
          geometry(s.variant),
          setupFor(s, rules),
          signOf(side),
        );
        for (const m of moves) out.push({ type: "move", ...pick(toPublic(m)) });
      }
      return out;
    },

    apply(s, { seat, action }, { rules, now }) {
      if (s.result) return err("GAME_OVER");
      if (seat !== s.light && seat !== (s.light + 1) % 2) return err("BAD_ACTION");
      const side = colourOf(s, seat);
      const d = draft(s);
      const events: GameEvent[] = [];

      switch (action.type) {
        case "move": {
          if (s.turn !== side) return err("NOT_YOUR_TURN");
          const e = playMove(d, side, action, rules, now, events);
          return e ? err(e) : ok(d, events);
        }
        case "huff": {
          if (s.turn !== side || s.huffable?.by !== side) return err("NOT_ALLOWED");
          if (!s.huffable.squares.includes(action.square)) return err("ILLEGAL_MOVE");
          d.board[action.square - 1] = 0;
          d.history[d.history.length - 1] = encode(d.board);
          d.huffable = null;
          events.push({ type: "huffed", side, square: action.square });
          const theirs = signOf(other(side));
          if (!d.board.some((v) => v * theirs > 0)) end(d, side, "no_pieces", events);
          else {
            const v = verdict(d, rules);
            if (v) end(d, v.winner, v.reason, events);
          }
          return ok(d, events);
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
          events.push({ type: "flagged", side: s.turn });
          end(d, other(s.turn), "timeout", events);
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
      !s.result && seatOf(s, s.turn) === seat ? moveDeadline(s, rules) : null,

    // Out of time: clocked games (and the abort window) flag; "No clock" games get a move made.
    timeoutAction(s, _seat, rules, rng) {
      if (ply(s) < 2 || s.clock) return { type: "flag" };
      return botAction({ ...s, huffable: null }, rules, EASY, rng);
    },

    autoAdvance: () => null,

    // Bots take back when asked and keep playing for a result (they decline draws).
    botReply(s, seat) {
      if (s.result) return null;
      const side = colourOf(s, seat);
      if (s.takeback?.by === other(side)) return { type: "accept_takeback" };
      if (s.drawOffer?.by === other(side)) return { type: "decline_draw" };
      return null;
    },

    aborted: (s) => s.result?.reason === "aborted",

    // About a second a move, quicker when short of time (as chess). The bot service's search
    // (Hard) and the network come on top.
    botThinkMs(s) {
      const left = s.clock && ply(s) >= 2 ? s.clock[s.turn].remainingMs : Infinity;
      if (left < 20_000) return [150, 400];
      if (left < 60_000) return [300, 800];
      return [500, 1500];
    },

    view: (s, viewer): DraughtsView => ({
      ...s,
      you: viewer === "spectator" ? null : colourOf(s, viewer),
    }),

    isOver: (s) => s.result !== null,
    ranking(s) {
      const r = s.result;
      if (!r || r.reason === "aborted") return [];
      const l = seatOf(s, "light");
      const dk = seatOf(s, "dark");
      if (r.winner === null) return [[l, dk]];
      return r.winner === "light" ? [[l], [dk]] : [[dk], [l]];
    },

    bots: {
      easy: (s, _seat, rules, rng) => botAction(s, rules, EASY, rng),
      medium: (s, _seat, rules, rng) => botAction(s, rules, MEDIUM, rng),
      // Hard normally comes from the bot service; this is its built-in fallback.
      hard: (s, _seat, rules, rng) => botAction(s, rules, MEDIUM, rng),
    },
  };

function canOfferDraw(s: DraughtsState, side: Colour): boolean {
  if (s.drawOffer || ply(s) < 2) return false;
  if (s.offersUsed.draw[side] >= MAX_OFFERS) return false;
  const declined = s.drawDeclinedAt[side];
  return declined === null || ply(s) - declined >= DRAW_OFFER_GAP_PLIES;
}

function canRequestTakeback(s: DraughtsState, side: Colour, rules: DraughtsRules): boolean {
  if (!rules.takebacks || s.takeback) return false;
  if (s.offersUsed.takeback[side] >= MAX_OFFERS) return false;
  // You need a move of your own to take back.
  const firstColour = ply(s) % 2 === 0 ? s.turn : other(s.turn);
  return s.moves.length >= (side === firstColour ? 1 : 2);
}

export { draughtsNaija, draughtsEnglish, type DraughtsRules } from "./rules";
export { draughtsRulesSchema } from "./schemas";
export type { Colour, DraughtsAction, DraughtsState, DraughtsView } from "./state";
