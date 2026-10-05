import { at } from "../../at";
import { err, ok } from "../../result";
import type { GameDefinition, GameEvent, Rng, SeatIndex } from "../../types";
import { rpsBots } from "./bots";
import { rpsLegalActions, rpsPlaces } from "./core";
import { rpsNaija, type RpsRules } from "./rules";
import { rpsActionSchema, rpsRulesSchema } from "./schemas";
import {
  BEATS,
  isLive,
  matchOf,
  type Match,
  type MatchView,
  type RpsAction,
  type RpsState,
  type RpsView,
  type Throw,
} from "./state";

const newMatch = (a: SeatIndex | null, b: SeatIndex | null): Match => {
  const m: Match = { a, b, score: [0, 0], ties: 0, picks: {}, history: [], winner: null };
  if (a !== null && b === null) m.winner = a; // bye
  if (a === null && b !== null) m.winner = b;
  return m;
};

/** Standard seeding: byes go to the top seeds. */
const SEED_ORDER: Record<number, number[]> = {
  2: [1, 2],
  4: [1, 4, 2, 3],
  8: [1, 8, 4, 5, 2, 7, 3, 6],
};

function firstRound(players: number, rng: Rng): Match[] {
  const seeds = rng.shuffle(Array.from({ length: players }, (_, i) => i));
  const size = players <= 2 ? 2 : players <= 4 ? 4 : 8;
  const order = SEED_ORDER[size] ?? [];
  const bySeed = (n: number): SeatIndex | null => (n <= players ? at(seeds, n - 1) : null);
  const matches: Match[] = [];
  for (let i = 0; i < order.length; i += 2)
    matches.push(newMatch(bySeed(at(order, i)), bySeed(at(order, i + 1))));
  return matches;
}

/** Pairs winners of a finished round: match 0 v 1, 2 v 3, … */
const nextRound = (prev: Match[]): Match[] => {
  const out: Match[] = [];
  for (let i = 0; i < prev.length; i += 2)
    out.push(newMatch(at(prev, i).winner, prev[i + 1]?.winner ?? null));
  return out;
};

function resolveThrow(m: Match, pa: Throw, pb: Throw, rules: RpsRules, rng: Rng): Match {
  const a = m.a as SeatIndex;
  const b = m.b as SeatIndex;
  let result: SeatIndex | "tie" = pa === pb ? "tie" : BEATS[pa] === pb ? a : b;
  let ties = result === "tie" ? m.ties + 1 : 0;
  let coin = false;
  if (result === "tie" && ties >= rules.maxTiesPerRound) {
    result = rng.int(2) === 0 ? a : b;
    coin = true;
    ties = 0;
  }
  const score: [number, number] = [...m.score];
  if (result !== "tie") score[result === a ? 0 : 1]++;
  const needed = Math.ceil(rules.bestOf / 2);
  const winner = score[0] >= needed ? a : score[1] >= needed ? b : null;
  return {
    ...m,
    score,
    ties,
    picks: {},
    history: [...m.history, { n: m.history.length + 1, a: pa, b: pb, result, coin }],
    winner,
  };
}

function hide(m: Match, viewer: SeatIndex | "spectator"): MatchView {
  const { picks, ...rest } = m;
  const thrown = Object.keys(picks).map(Number);
  const mine = viewer !== "spectator" ? picks[viewer] : undefined;
  return mine ? { ...rest, thrown, mine } : { ...rest, thrown };
}

export const rps: GameDefinition<RpsState, RpsAction, RpsView, RpsRules> = {
  slug: "rps",
  minPlayers: 2,
  maxPlayers: 8,
  presets: { naija: rpsNaija },
  ruleSchema: rpsRulesSchema,
  actionSchema: rpsActionSchema,

  setup: (players, { rng }) => ({
    players,
    rounds: [firstRound(players, rng)],
    round: 0,
    eliminated: [],
    over: false,
    champion: null,
  }),

  currentSeats(s) {
    if (s.over) return [];
    return (s.rounds[s.round] ?? [])
      .filter(isLive)
      .flatMap((m) =>
        [m.a, m.b].filter((x): x is SeatIndex => x !== null && m.picks[x] === undefined),
      );
  },

  legalActions: (s, seat) => rpsLegalActions(s, seat),

  apply(s, { seat, action }, { rules, rng }) {
    if (s.over) return err("GAME_OVER");
    const m = matchOf(s.rounds, s.round, seat);
    if (!m || !isLive(m)) return err("NOT_YOUR_TURN");
    if (m.picks[seat] !== undefined) return err("ALREADY_THREW");

    const events: GameEvent[] = [{ type: "threw", seat }];
    const idx = (s.rounds[s.round] ?? []).indexOf(m);
    let match: Match = { ...m, picks: { ...m.picks, [seat]: action.pick } };
    const pa = match.a !== null ? match.picks[match.a] : undefined;
    const pb = match.b !== null ? match.picks[match.b] : undefined;
    if (pa && pb) {
      match = resolveThrow(match, pa, pb, rules, rng);
      const last = at(match.history, match.history.length - 1);
      events.push({
        type: "revealed",
        round: s.round,
        match: idx,
        a: last.a,
        b: last.b,
        result: last.result,
        coin: last.coin,
      });
    }

    const rounds = s.rounds.map((r, ri) =>
      ri === s.round ? r.map((x, mi) => (mi === idx ? match : x)) : r,
    );
    let next: RpsState = { ...s, rounds };

    if (match.winner !== null) {
      const loser = (match.winner === match.a ? match.b : match.a) as SeatIndex;
      next = { ...next, eliminated: [...next.eliminated, { seat: loser, round: s.round }] };
      events.push({ type: "match_won", seat: match.winner, round: s.round });
      const current = at(next.rounds, s.round);
      if (current.every((x) => x.winner !== null)) {
        if (current.length === 1) {
          next = { ...next, over: true, champion: match.winner };
          events.push({ type: "champion", seat: match.winner });
        } else {
          next = { ...next, rounds: [...next.rounds, nextRound(current)], round: s.round + 1 };
          events.push({ type: "round_started", round: s.round + 1 });
        }
      }
    }
    return ok(next, events);
  },

  // Spec: a timed-out throw is random (server RNG).
  timeoutAction: (_s, _seat, _rules, rng) => rpsBots.easy(_s, _seat, rng),

  autoAdvance: () => null,

  // The client plays "Rock… Paper… Scissors… Shoot!" and holds the flip (~2.3 s) after
  // each reveal; the next throw's clock starts after that.
  eventPauses: { revealed: 2400 },

  view: (s, viewer) => ({ ...s, rounds: s.rounds.map((r) => r.map((m) => hide(m, viewer))) }),

  isOver: (s) => s.over,

  /** Champion 1st, final loser 2nd, semi-final losers joint 3rd, earlier losers grouped by round. */
  ranking: (s) => rpsPlaces(s),

  bots: {
    easy: (s, seat, _rules, rng) => rpsBots.easy(s, seat, rng),
    medium: (s, seat, _rules, rng) => rpsBots.medium(s, seat, rng),
    hard: (s, seat, _rules, rng) => rpsBots.hard(s, seat, rng),
  },
};

export { rpsNaija, type RpsRules } from "./rules";
export { rpsRulesSchema } from "./schemas";
export type { RpsAction, RpsState, RpsView, Throw } from "./state";
