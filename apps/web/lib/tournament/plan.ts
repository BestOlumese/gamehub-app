// The tournament setup's plan helpers (client-safe: light engine entries only).
import type { GameSlug } from "@gamehub/engine";
import { chessNaija } from "@gamehub/engine/chess";
import { draughtsNaija } from "@gamehub/engine/draughts";
import { footballNaija } from "@gamehub/engine/football";
import { ludoNaija } from "@gamehub/engine/ludo";
import { plotsNaija } from "@gamehub/engine/plots";
import { rpsNaija } from "@gamehub/engine/rps";
import { snakesNaija } from "@gamehub/engine/snakes";
import { tttNaija } from "@gamehub/engine/tictactoe";
import {
  goThrough,
  isKnockout,
  knockoutRounds,
  nextPow2,
  spread,
  STAGE_GAMES,
  stageFlow,
  type StageSpec,
} from "@gamehub/engine/tournament";
import { whotNaija } from "@gamehub/engine/whot";

export { STAGE_GAMES, stageFlow, isKnockout, nextPow2 };
export type { StageSpec };

export const STAGE_ORDER: readonly GameSlug[] = [
  "whot",
  "ludo",
  "snakes",
  "chess",
  "draughts",
  "football",
  "plots",
  "rps",
  "tictactoe",
];

export const PRESETS: Record<GameSlug, unknown> = {
  whot: whotNaija,
  ludo: ludoNaija,
  snakes: snakesNaija,
  tictactoe: tttNaija,
  rps: rpsNaija,
  chess: chessNaija,
  draughts: draughtsNaija,
  plots: plotsNaija,
  football: footballNaija,
};

/** A sensible new stage for `game` with `n` players left (the host adjusts it in the sheet). */
export function defaultStage(game: GameSlug, n: number, last: boolean): StageSpec {
  const g = STAGE_GAMES[game];
  const rules = PRESETS[game];
  // One-on-one games are knockouts; the rest tables of 4 (or everyone, for a final).
  if (g.max === 2)
    return {
      game,
      rules,
      tableSize: 2,
      advance: last ? 1 : Math.max(2, nextPow2(n) / 4),
      bestOf: 1,
    };
  const size = last ? Math.min(g.max, n) : Math.min(g.max, 4, n);
  return {
    game,
    rules,
    tableSize: Math.max(2, size),
    advance: last ? 1 : Math.max(1, Math.floor(size / 2)),
    bestOf: 1,
  };
}

/** "Tables of 4 · top 2 go through", "Knockout to 4 · best of 3", "Final table of 6". */
export function stageSummary(s: StageSpec, n: number, last: boolean): string {
  if (isKnockout(s)) {
    const to = last ? "a winner" : `the last ${s.advance}`;
    return `Knockout to ${to}${s.bestOf > 1 ? ` · best of ${s.bestOf}` : ""}`;
  }
  if (last) return `Final table of ${s.tableSize}`;
  return `Tables of ${s.tableSize} · top ${s.advance} go through`;
}

/**
 * Rows a table writes (docs/13-free-tier-budget.md, per game at its usual size), scaled by
 * table size for games where more players mean more moves.
 */
const TABLE_ROWS: Record<GameSlug, number> = {
  whot: 240,
  ludo: 950,
  snakes: 260,
  tictactoe: 40,
  rps: 30,
  chess: 150,
  draughts: 125,
  plots: 250,
  football: 80,
};

/** How much of a day's free capacity (100k rows) this plan would use, in percent. */
export function capacityPercent(entrants: number, stages: readonly StageSpec[]): number {
  const { counts } = stageFlow(entrants, stages);
  let rows = 80; // the tournament itself: lobby, draws, reports, snapshots
  stages.forEach((s, i) => {
    const n = counts[i] ?? 0;
    if (n < 2) return;
    const per = TABLE_ROWS[s.game];
    if (isKnockout(s)) {
      const target = i === stages.length - 1 ? 1 : s.advance;
      const rounds = knockoutRounds(n, target);
      // Matches: everyone but the target is knocked out, one match each; a series plays more.
      rows += (n - target) * per * (s.bestOf === 1 ? 1 : (s.bestOf + 1) / 2) + rounds * 10;
    } else {
      for (const size of spread(n, s.tableSize)) rows += per * Math.max(0.5, size / 4);
    }
  });
  return Math.max(1, Math.round(rows / 1000));
}

/** Players left after each stage, for the flow line ("16 → 8 → 4 → 1"). */
export function flowLine(entrants: number, stages: readonly StageSpec[]): string {
  return stageFlow(entrants, stages).counts.join(" → ");
}

/** How many go through from a table of `size` (smaller tables in proportion). */
export { goThrough };

/** The last stage, if it's a table, seats everyone left (so changing the count keeps it valid). */
export function normalise(entrants: number, stages: StageSpec[]): StageSpec[] {
  const { counts } = stageFlow(entrants, stages);
  return stages.map((s, i) => {
    if (i !== stages.length - 1 || isKnockout(s)) return s;
    const n = counts[i] ?? s.tableSize;
    return { ...s, tableSize: Math.max(2, Math.min(n, STAGE_GAMES[s.game].max)), advance: 1 };
  });
}

export const starterPlan = (entrants: number): StageSpec[] => [
  defaultStage("whot", entrants, false),
  defaultStage("chess", Math.ceil(entrants / 2), true),
];
