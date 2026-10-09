// Plain values and types only (no zod), so the browser can import them cheaply.
import type { TimeControl } from "../clock";

export type Variant = "naija10" | "english8";

export type DraughtsRules = {
  /** RuleConfigBase; draughts uses its own deadlines (clock, per-move limit, abort). */
  turnSeconds: number;
  variant: Variant;
  /** naija10 only: the Nigerian mirrored board (long diagonal on your right) or the FMJD one. */
  orientation: "naija" | "fmjd";
  firstMove: "random" | "light" | "dark";
  menCaptureBackward: boolean;
  flyingKings: boolean;
  /** "free": any capture sequence (Nigerian club play, Best's default); "majority": the longest. */
  captureRule: "majority" | "free";
  /** "forced": the app makes you capture; "huff": you may skip it, and your opponent may huff. */
  missedCapture: "forced" | "huff";
  /** The move-count draw rules (repetition and agreement always apply). */
  drawRules: "standard" | "none";
  timeControl: TimeControl;
  /** "No clock" games: each move must come within this many seconds (60–900). */
  moveLimitSeconds: number;
  /** Each side's first move must come within this many seconds, or the game is aborted. */
  abortSeconds: number;
  takebacks: boolean;
};

export const draughtsNaija: DraughtsRules = {
  turnSeconds: 60,
  variant: "naija10",
  orientation: "naija",
  firstMove: "random",
  menCaptureBackward: true,
  flyingKings: true,
  captureRule: "free",
  missedCapture: "forced",
  drawRules: "standard",
  timeControl: null,
  moveLimitSeconds: 300,
  abortSeconds: 30,
  takebacks: true,
};

/** English checkers: the variant fixes these (the rules sheet shows them read-only). */
export const englishFixed = {
  variant: "english8",
  firstMove: "dark",
  menCaptureBackward: false,
  flyingKings: false,
  captureRule: "free",
} as const;

export const draughtsEnglish: DraughtsRules = { ...draughtsNaija, ...englishFixed };

/** Variant-fixed fields win over whatever else the rules say. */
export const effective = (r: DraughtsRules): DraughtsRules =>
  r.variant === "english8" ? { ...r, ...englishFixed } : r;

/** The time controls on offer (No clock is the private default). */
export const DRAUGHTS_TIME_PRESETS: ReadonlyArray<{
  baseSeconds: number;
  incrementSeconds: number;
}> = [
  { baseSeconds: 180, incrementSeconds: 2 },
  { baseSeconds: 300, incrementSeconds: 3 },
  { baseSeconds: 600, incrementSeconds: 5 },
  { baseSeconds: 900, incrementSeconds: 10 },
];
