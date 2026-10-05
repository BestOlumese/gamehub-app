import { err, ok } from "../../result";
import type { GameDefinition, GameEvent, SeatIndex } from "../../types";
import { ludoBots } from "./bots";
import {
  capturesAt,
  coloursFor,
  HOME,
  HOP_MS,
  legalSeeds,
  nextSeat,
  progressOf,
  ROLL_SHOW_MS,
  SETTLE_MS,
  target,
} from "./core";
import { ludoNaija, type LudoRules } from "./rules";
import { ludoActionSchema, ludoRulesSchema } from "./schemas";
import type { LudoAction, LudoState, LudoView } from "./state";

/** Working copy: apply() mutates this, never the input state. */
function draft(s: LudoState): LudoState {
  return {
    ...s,
    seeds: s.seeds.map((x) => [...x]),
    finished: [...s.finished],
    movable: [...s.movable],
  };
}

function passTurn(d: LudoState) {
  d.turn = nextSeat(d.turn, d.players, d.finished);
  d.phase = "roll";
  d.die = null;
  d.movable = [];
  d.sixesInRow = 0;
}

/** Seats still playing, grouped by progress (most first; ties share a place). */
function rankByProgress(d: LudoState, seats: SeatIndex[]): SeatIndex[][] {
  const by = new Map<number, SeatIndex[]>();
  for (const seat of seats) {
    const t = progressOf(d.seeds[seat] ?? []);
    by.set(t, [...(by.get(t) ?? []), seat]);
  }
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([, g]) => g);
}

function finishSeat(d: LudoState, seat: SeatIndex, rules: LudoRules, events: GameEvent[]) {
  d.finished.push(seat);
  events.push({ type: "finished", seat });
  const left = Array.from({ length: d.players }, (_, i) => i).filter(
    (i) => !d.finished.includes(i),
  );
  if (rules.endMode === "firstFinisherEnds") {
    d.over = true;
    d.places = [[seat], ...rankByProgress(d, left)];
  } else if (left.length <= 1) {
    d.finished.push(...left);
    d.over = true;
    d.places = d.finished.map((x) => [x]);
  }
}

/** One seed to move with no real choice: the only legal one, or several that sit together. */
function onlyChoice(s: LudoState): number | null {
  const [first] = s.movable;
  if (first === undefined) return null;
  const from = s.seeds[s.turn] ?? [];
  return s.movable.every((seed) => from[seed] === from[first]) ? first : null;
}

export const ludo: GameDefinition<LudoState, LudoAction, LudoView, LudoRules> = {
  slug: "ludo",
  minPlayers: 2,
  maxPlayers: 4,
  presets: { naija: ludoNaija },
  ruleSchema: ludoRulesSchema,
  actionSchema: ludoActionSchema,

  setup(players) {
    return {
      players,
      colours: coloursFor(players),
      seeds: Array.from({ length: players }, () => [-1, -1, -1, -1]),
      turn: 0,
      phase: "roll",
      die: null,
      lastRoll: null,
      sixesInRow: 0,
      movable: [],
      finished: [],
      over: false,
      places: null,
    };
  },

  currentSeats: (s) => (s.over ? [] : [s.turn]),

  legalActions(s, seat) {
    if (s.over || seat !== s.turn) return [];
    if (s.phase === "roll") return [{ type: "roll" }];
    return s.movable.map((seed) => ({ type: "move", seed }));
  },

  apply(s, { seat, action }, { rules, rng }) {
    if (s.over) return err("GAME_OVER");
    if (seat !== s.turn) return err("NOT_YOUR_TURN");
    const d = draft(s);
    const events: GameEvent[] = [];

    if (action.type === "roll") {
      if (s.phase !== "roll") return err("ILLEGAL_MOVE");
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
      const movable = legalSeeds(d, value, rules);
      if (!movable.length) {
        events.push({ type: "no_move", seat });
        // A six still earns its roll even when nothing can use it.
        if (value === 6 && rules.sixRollsAgain) d.die = null;
        else passTurn(d);
        return ok(d, events);
      }
      d.phase = "move";
      d.die = value;
      d.movable = movable;
      return ok(d, events);
    }

    // Move a seed.
    if (s.phase !== "move" || s.die === null) return err("ILLEGAL_MOVE");
    if (!s.movable.includes(action.seed)) {
      const p = s.seeds[seat]?.[action.seed];
      return err(p === -1 && rules.needSixToLeaveYard ? "NEED_SIX" : "ILLEGAL_MOVE");
    }
    const die = s.die;
    const seeds = d.seeds[seat] as number[];
    const from = seeds[action.seed] as number;
    const to = target(s, seat, action.seed, die, rules) as number;
    const path = from === -1 ? [0] : Array.from({ length: to - from }, (_, i) => from + 1 + i);
    const victims = capturesAt(d, seat, to, rules);
    seeds[action.seed] = to;
    events.push({ type: "moved", seat, seed: action.seed, from, to, path });
    for (const v of victims) {
      (d.seeds[v.seat] as number[])[v.seed] = -1;
      events.push({ type: "captured", by: seat, victimSeat: v.seat, seed: v.seed });
    }
    const home = to === HOME;
    if (home) events.push({ type: "entered_home", seat, seed: action.seed });
    d.die = null;
    d.movable = [];
    d.phase = "roll";
    if (seeds.every((p) => p === HOME)) {
      finishSeat(d, seat, rules, events);
      if (d.over) return ok(d, events);
      passTurn(d);
      return ok(d, events);
    }
    const bonus =
      (die === 6 && rules.sixRollsAgain) ||
      (victims.length > 0 && rules.captureGivesBonusRoll) ||
      (home && rules.homeGivesBonusRoll);
    if (!bonus) passTurn(d);
    return ok(d, events);
  },

  timeoutAction(s) {
    if (s.phase === "roll") return { type: "roll" };
    // Furthest-along seed that can move (simple and predictable).
    const seeds = s.seeds[s.turn] ?? [];
    const best = [...s.movable].sort((a, b) => (seeds[b] ?? 0) - (seeds[a] ?? 0))[0] ?? 0;
    return { type: "move", seed: best };
  },

  autoAdvance(s, rules) {
    if (s.over || s.phase !== "move" || !rules.autoMoveSingle) return null;
    const seed = onlyChoice(s);
    // Made straight away; the client shows the die and then the hops (see chainTurns).
    return seed === null ? null : { seat: s.turn, action: { type: "move", seed }, afterMs: 0 };
  },

  // A bot's whole turn (and a forced move) is one storage write; clients play it back,
  // and turn clocks wait for that playback (these match the client's timings).
  chainTurns: true,
  eventPauses: {
    rolled: ROLL_SHOW_MS,
    moved: (e) => HOP_MS * ((e.path as unknown[] | undefined)?.length ?? 1) + SETTLE_MS,
  },
  botThinkMs: (_s, a) => (a.type === "roll" ? [500, 900] : [600, 1200]),

  view: (s) => s,
  isOver: (s) => s.over,
  ranking: (s) => s.places ?? [],

  bots: {
    easy: (s, seat, rules, rng) => ludoBots.easy(s, seat, rules, rng),
    medium: (s, seat, rules, rng) => ludoBots.medium(s, seat, rules, rng),
    hard: (s, seat, rules, rng) => ludoBots.hard(s, seat, rules, rng),
  },
};

export { ludoNaija, type LudoRules } from "./rules";
export { ludoRulesSchema } from "./schemas";
export type { Colour, LudoAction, LudoState, LudoView } from "./state";
