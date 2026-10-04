import { err, ok } from "../../result";
import type { GameDefinition, GameEvent, SeatIndex } from "../../types";
import { tttBots } from "./bots";
import { tttLegalActions } from "./core";
import { NEXT_ROUND_DELAY_MS, SUDDEN_DEATH_ROUNDS, tttNaija, type TttRules } from "./rules";
import { tttActionSchema, tttRulesSchema } from "./schemas";
import { emptyCells, winningLine, type TttAction, type TttState, type TttView } from "./state";

function freshRound(
  prev: Pick<TttState, "score" | "draws">,
  round: number,
  starter: SeatIndex,
): TttState {
  return {
    board: Array<null>(9).fill(null),
    turn: starter,
    starter,
    round,
    score: prev.score,
    draws: prev.draws,
    roundWinner: null,
    winLine: null,
    over: false,
    seriesWinner: null,
  };
}

/** After a round ends: is the series decided? */
function seriesResult(s: TttState, rules: TttRules): SeatIndex | "draw" | null {
  const needed = Math.ceil(rules.bestOf / 2);
  if (s.score[0] >= needed) return 0;
  if (s.score[1] >= needed) return 1;
  if (s.round < rules.bestOf) return null;
  if (s.score[0] !== s.score[1]) return s.score[0] > s.score[1] ? 0 : 1;
  return s.round >= rules.bestOf + SUDDEN_DEATH_ROUNDS ? "draw" : null; // level: sudden death
}

export const tictactoe: GameDefinition<TttState, TttAction, TttView, TttRules> = {
  slug: "tictactoe",
  minPlayers: 2,
  maxPlayers: 2,
  presets: { naija: tttNaija },
  ruleSchema: tttRulesSchema,
  actionSchema: tttActionSchema,

  setup: () => freshRound({ score: [0, 0], draws: 0 }, 1, 0),

  currentSeats: (s) => (s.over || s.roundWinner !== null ? [] : [s.turn]),

  legalActions: (s, seat) => tttLegalActions(s, seat),

  apply(s, { seat, action }, { rules }) {
    if (s.over) return err("GAME_OVER");

    if (action.type === "next_round") {
      if (s.roundWinner === null) return err("ILLEGAL_MOVE");
      const starter = (rules.alternateStarter ? 1 - s.starter : s.starter) as SeatIndex;
      return ok(freshRound(s, s.round + 1, starter), [
        { type: "round_started", round: s.round + 1, starter },
      ]);
    }

    if (seat !== 0 && seat !== 1) return err("BAD_ACTION");
    if (s.roundWinner !== null) return err("ILLEGAL_MOVE");
    if (seat !== s.turn) return err("NOT_YOUR_TURN");
    if (s.board[action.cell] !== null) return err("ILLEGAL_MOVE");

    const board = s.board.slice();
    board[action.cell] = seat;
    const events: GameEvent[] = [{ type: "placed", seat, cell: action.cell }];
    let next: TttState = { ...s, board, turn: (1 - seat) as SeatIndex };

    const line = winningLine(board);
    if (line) {
      const score: [number, number] = [...s.score];
      score[seat]++;
      next = { ...next, score, roundWinner: seat, winLine: [...line] };
      events.push({ type: "round_won", seat, line: [...line] });
    } else if (emptyCells(board).length === 0) {
      next = { ...next, draws: s.draws + 1, roundWinner: "draw" };
      events.push({ type: "round_draw" });
    }

    if (next.roundWinner !== null) {
      const result = seriesResult(next, rules);
      if (result !== null) {
        next = { ...next, over: true, seriesWinner: result };
        events.push({ type: "series_won", seat: result });
      }
    }
    return ok(next, events);
  },

  // Spec: a timed-out turn plays an Easy-bot move.
  timeoutAction: (s, seat, _rules, rng) => tttBots.easy(s, seat, rng),

  autoAdvance: (s) =>
    !s.over && s.roundWinner !== null
      ? { seat: s.starter, action: { type: "next_round" }, afterMs: NEXT_ROUND_DELAY_MS }
      : null,

  view: (s) => s,
  isOver: (s) => s.over,

  ranking(s) {
    if (s.seriesWinner === 0 || s.seriesWinner === 1)
      return [[s.seriesWinner], [1 - s.seriesWinner]];
    return [[0, 1]];
  },

  bots: {
    easy: (s, seat, _rules, rng) => tttBots.easy(s, seat, rng),
    medium: (s, seat, _rules, rng) => tttBots.medium(s, seat, rng),
    hard: (s, seat, _rules, rng) => tttBots.hard(s, seat, rng),
  },
};

export { tttNaija, type TttRules } from "./rules";
export { tttRulesSchema } from "./schemas";
export type { TttAction, TttState, TttView } from "./state";
