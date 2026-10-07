import { err, ok } from "../../result";
import type { GameDefinition, GameEvent, SeatIndex } from "../../types";
import { resolve } from "./boards";
import { boardFor, FINISH, HOP_MS, ROLL_SHOW_MS, SETTLE_MS, SLIDE_MS } from "./core";
import { snakesNaija, type SnakesRules } from "./rules";
import { snakesActionSchema, snakesRulesSchema } from "./schemas";
import type { SnakesAction, SnakesState, SnakesView } from "./state";

const draft = (s: SnakesState): SnakesState => ({
  ...s,
  pos: [...s.pos],
  finished: [...s.finished],
});

function nextSeat(from: SeatIndex, players: number, finished: readonly SeatIndex[]) {
  let seat = from;
  for (let i = 0; i < players; i++) {
    seat = (seat + 1) % players;
    if (!finished.includes(seat)) return seat;
  }
  return from;
}

function passTurn(d: SnakesState) {
  d.turn = nextSeat(d.turn, d.players, d.finished);
  d.sixesInRow = 0;
}

/** Seats still playing, grouped by square (furthest first; ties share a place). */
function rankBySquare(d: SnakesState, seats: SeatIndex[]): SeatIndex[][] {
  const by = new Map<number, SeatIndex[]>();
  for (const seat of seats) by.set(d.pos[seat] ?? 0, [...(by.get(d.pos[seat] ?? 0) ?? []), seat]);
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([, g]) => g);
}

function finishSeat(d: SnakesState, seat: SeatIndex, rules: SnakesRules, events: GameEvent[]) {
  d.finished.push(seat);
  events.push({ type: "finished", seat });
  const left = Array.from({ length: d.players }, (_, i) => i).filter(
    (i) => !d.finished.includes(i),
  );
  if (rules.firstFinisherEnds) {
    d.over = true;
    d.places = [[seat], ...rankBySquare(d, left)];
  } else if (left.length <= 1) {
    d.finished.push(...left);
    d.over = true;
    d.places = d.finished.map((x) => [x]);
  }
}

export const snakes: GameDefinition<SnakesState, SnakesAction, SnakesView, SnakesRules> = {
  slug: "snakes",
  minPlayers: 2,
  maxPlayers: 8,
  presets: { naija: snakesNaija },
  ruleSchema: snakesRulesSchema,
  actionSchema: snakesActionSchema,

  setup(players, { rules }) {
    return {
      players,
      board: rules.board,
      pos: Array<number>(players).fill(0),
      turn: 0,
      sixesInRow: 0,
      lastRoll: null,
      finished: [],
      over: false,
      places: null,
    };
  },

  currentSeats: (s) => (s.over ? [] : [s.turn]),
  legalActions: (s, seat) => (s.over || seat !== s.turn ? [] : [{ type: "roll" }]),

  apply(s, { seat }, { rules, rng }) {
    if (s.over) return err("GAME_OVER");
    if (seat !== s.turn) return err("NOT_YOUR_TURN");
    const d = draft(s);
    const events: GameEvent[] = [];
    const value = rng.int(6) + 1;
    d.lastRoll = { seat, value };
    events.push({ type: "rolled", seat, d: value });

    const sixes = value === 6 ? s.sixesInRow + 1 : 0;
    if (value === 6 && rules.maxConsecutiveSixes > 0 && sixes >= rules.maxConsecutiveSixes) {
      events.push({ type: "six_forfeit", seat });
      passTurn(d);
      return ok(d, events);
    }
    d.sixesInRow = sixes;
    const bonus = value === 6 && rules.sixRollsAgain;
    const from = d.pos[seat] ?? 0;

    let landing = from + value;
    if (from === 0 && rules.needSixToStart && value !== 6) {
      events.push({ type: "no_move", seat, reason: "need_six" });
      if (!bonus) passTurn(d);
      return ok(d, events);
    }
    if (landing > FINISH) {
      if (rules.exactRollToFinish) {
        events.push({ type: "no_move", seat, reason: "overshoot" });
        if (!bonus) passTurn(d);
        return ok(d, events);
      }
      landing = FINISH;
    }
    const path = Array.from({ length: landing - from }, (_, i) => from + 1 + i);
    events.push({ type: "moved", seat, from, to: landing, path });

    const board = boardFor(d.board);
    const to = resolve(board, landing);
    if (to > landing) events.push({ type: "ladder", seat, from: landing, to });
    if (to < landing) events.push({ type: "snake", seat, from: landing, to });
    d.pos[seat] = to;

    if (rules.bump && to !== FINISH) {
      d.pos.forEach((p, other) => {
        if (other !== seat && p === to && !d.finished.includes(other)) {
          d.pos[other] = 0;
          events.push({ type: "bumped", seat, victim: other, from: to });
        }
      });
    }

    if (to === FINISH) {
      finishSeat(d, seat, rules, events);
      if (!d.over) passTurn(d);
      return ok(d, events);
    }
    if (!bonus) passTurn(d);
    return ok(d, events);
  },

  timeoutAction: () => ({ type: "roll" }),

  autoAdvance(s, rules) {
    if (s.over || !rules.autoRoll) return null;
    return { seat: s.turn, action: { type: "roll" }, afterMs: 1500 };
  },

  // A whole turn (roll + bonus rolls) is one write; clients play it back and clocks wait.
  chainTurns: true,
  eventPauses: {
    rolled: ROLL_SHOW_MS,
    moved: (e) => HOP_MS * ((e.path as unknown[] | undefined)?.length ?? 1) + SETTLE_MS,
    ladder: SLIDE_MS,
    snake: SLIDE_MS,
  },
  botThinkMs: () => [500, 900],

  view: (s) => s,
  isOver: (s) => s.over,
  ranking: (s) => s.places ?? [],

  // It's pure luck: every level just rolls.
  bots: {
    easy: () => ({ type: "roll" }),
    medium: () => ({ type: "roll" }),
    hard: () => ({ type: "roll" }),
  },
};

export { BOARDS, BOARD_IDS, type Board, type BoardId } from "./boards";
export { snakesNaija, type SnakesRules } from "./rules";
export { snakesRulesSchema } from "./schemas";
export type { SnakesAction, SnakesState, SnakesView } from "./state";
