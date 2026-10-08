// Plain values and types only (no zod), so the browser can import them cheaply.

/** Minutes + seconds added per move; null = no clock (a per-move limit instead). */
export type TimeControl = { baseSeconds: number; incrementSeconds: number } | null;

export type ChessRules = {
  /** RuleConfigBase; chess uses its own deadlines (clock, per-move limit, abort). */
  turnSeconds: number;
  timeControl: TimeControl;
  /** "No clock" games: each move must come within this many seconds (60–900). */
  moveLimitSeconds: number;
  /** Threefold repetition and the 50-move rule: end the game at once, or a "Claim draw" button. */
  drawClaims: "auto" | "claim";
  takebacks: boolean;
  premoves: boolean;
  /** Each side's first move must come within this many seconds, or the game is aborted (15–60). */
  abortSeconds: number;
  autoQueenPremove: boolean;
};

export const chessNaija: ChessRules = {
  turnSeconds: 30,
  timeControl: { baseSeconds: 300, incrementSeconds: 3 }, // 5+3 blitz
  moveLimitSeconds: 300,
  drawClaims: "auto",
  takebacks: true,
  premoves: true,
  abortSeconds: 30,
  autoQueenPremove: true,
};

export type Speed = "bullet" | "blitz" | "rapid";

/** Lichess's speed buckets, by estimated game length (base + 40 × increment). Classical folds into rapid. */
export function speedOf(tc: TimeControl): Speed | null {
  if (!tc) return null;
  const est = tc.baseSeconds + 40 * tc.incrementSeconds;
  return est < 180 ? "bullet" : est < 480 ? "blitz" : "rapid";
}

/** The time controls on offer (docs/games/chess.md). */
export const TIME_PRESETS: ReadonlyArray<{ baseSeconds: number; incrementSeconds: number }> = [
  { baseSeconds: 60, incrementSeconds: 0 },
  { baseSeconds: 120, incrementSeconds: 1 },
  { baseSeconds: 180, incrementSeconds: 0 },
  { baseSeconds: 180, incrementSeconds: 2 },
  { baseSeconds: 300, incrementSeconds: 0 },
  { baseSeconds: 300, incrementSeconds: 3 },
  { baseSeconds: 600, incrementSeconds: 0 },
  { baseSeconds: 600, incrementSeconds: 5 },
  { baseSeconds: 900, incrementSeconds: 10 },
  { baseSeconds: 1800, incrementSeconds: 0 },
];

export const timeLabel = (tc: TimeControl) =>
  tc ? `${tc.baseSeconds / 60}+${tc.incrementSeconds}` : "No clock";
