// Quick-match queues (docs/08-matchmaking-ratings.md): what each game's queue plays, how big,
// whether it's ranked, and which rating pool it counts in. Pure, shared by web and the Worker.
import type { GameSlug } from "../types";
import { chessNaija, type ChessRules } from "../games/chess/rules";
import { draughtsEnglish, draughtsNaija, type DraughtsRules } from "../games/draughts/rules";
import { footballNaija } from "../games/football/rules";
import { ludoNaija } from "../games/ludo/rules";
import { plotsNaija } from "../games/plots/rules";
import { rpsNaija } from "../games/rps/rules";
import { snakesNaija } from "../games/snakes/rules";
import { tttNaija } from "../games/tictactoe/rules";
import { whotNaija } from "../games/whot/rules";

/** Quick-match turns: the same 30 s for everyone (clocked games use their clock instead). */
export const QUICK_TURN_SECONDS = 30;
/** Bots join a queue this long after the first person (unless they chose to keep waiting). */
export const BOT_FILL_MS = 20_000;
/** Keep waiting: give up after this long. */
export const MAX_WAIT_MS = 3 * 60_000;
/** Ranked, the same two people: more meetings than this in 24 h stop counting for that pair. */
export const PAIR_CAP = 5;
/** Ratings show as "Placement n/10" until this many ranked games. */
export const PLACEMENT_GAMES = 10;

export type QuickGame = {
  game: GameSlug;
  sizes: readonly number[];
  ranked: boolean;
};

export const QUICK_GAMES: Record<GameSlug, QuickGame> = {
  whot: { game: "whot", sizes: [2, 3, 4, 5, 6, 7, 8], ranked: true },
  ludo: { game: "ludo", sizes: [2, 3, 4], ranked: true },
  snakes: { game: "snakes", sizes: [2, 3, 4, 5, 6, 7, 8], ranked: true },
  tictactoe: { game: "tictactoe", sizes: [2], ranked: true },
  rps: { game: "rps", sizes: [2, 3, 4, 5, 6, 7, 8], ranked: true },
  chess: { game: "chess", sizes: [2], ranked: true },
  draughts: { game: "draughts", sizes: [2], ranked: true },
  plots: { game: "plots", sizes: [2, 3, 4, 5, 6, 7, 8], ranked: false },
  football: { game: "football", sizes: [2], ranked: false },
};

export type TimeControl = { baseSeconds: number; incrementSeconds: number };
export type QueueSpec = {
  game: GameSlug;
  players: number;
  /** Chess: the clock (any offered preset). */
  timeControl?: TimeControl | null;
  /** Draughts: naija10 or english8. */
  variant?: "naija10" | "english8" | null;
};

/** Ranked draughts plays 5+3 (decided with Best, Oct 2026). */
export const DRAUGHTS_QUICK_CLOCK: TimeControl = { baseSeconds: 300, incrementSeconds: 3 };

/** Chess rating pool by clock: base + 40 × increment under 180 s bullet, under 480 s blitz, else rapid. */
export function chessCategory(tc: TimeControl): "bullet" | "blitz" | "rapid" {
  const t = tc.baseSeconds + 40 * tc.incrementSeconds;
  return t < 180 ? "bullet" : t < 480 ? "blitz" : "rapid";
}

export const clockLabel = (tc: TimeControl) =>
  `${Math.round(tc.baseSeconds / 60)}+${tc.incrementSeconds}`;

export type Queue = {
  /** The queue's name, e.g. "whot-4", "chess-3+2", "draughts-naija10-5+3". */
  key: string;
  game: GameSlug;
  size: number;
  rules: unknown;
  /** Rating pool within the game ("standard" for most). */
  variant: string;
  timeControl: string | null;
  ranked: boolean;
};

const PRESETS: Record<GameSlug, unknown> = {
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

/** The queue a request joins, with its fixed rules; null if the request isn't one we offer. */
export function queueOf(q: QueueSpec): Queue | null {
  const g = QUICK_GAMES[q.game];
  if (!g || !g.sizes.includes(q.players)) return null;
  const base = { game: q.game, size: q.players, ranked: g.ranked };
  if (q.game === "chess") {
    const tc = q.timeControl;
    if (!tc) return null;
    const rules: ChessRules = {
      ...chessNaija,
      timeControl: tc,
      takebacks: false,
      turnSeconds: QUICK_TURN_SECONDS,
    };
    return {
      ...base,
      key: `chess-${clockLabel(tc)}`,
      rules,
      variant: chessCategory(tc),
      timeControl: clockLabel(tc),
    };
  }
  if (q.game === "draughts") {
    const v = q.variant ?? "naija10";
    const rules: DraughtsRules = {
      ...(v === "english8" ? draughtsEnglish : draughtsNaija),
      timeControl: DRAUGHTS_QUICK_CLOCK,
      takebacks: false,
      turnSeconds: QUICK_TURN_SECONDS,
    };
    return {
      ...base,
      key: `draughts-${v}-${clockLabel(DRAUGHTS_QUICK_CLOCK)}`,
      rules,
      variant: v,
      timeControl: clockLabel(DRAUGHTS_QUICK_CLOCK),
    };
  }
  const rules = { ...(PRESETS[q.game] as object), turnSeconds: QUICK_TURN_SECONDS };
  return { ...base, key: `${q.game}-${q.players}`, rules, variant: "standard", timeControl: null };
}

/** The friendly rating number: 1000 + 40 × (mu − 3σ), never below 0 (a new player ≈ 1000). */
export function displayRating(r: { mu: number; sigma: number }): number {
  return Math.max(0, Math.round(1000 + (r.mu - 3 * r.sigma) * 40));
}
