// Football Draft room rules (docs/games/football-draft/modes.md). Plain values only.
import type { DraftLuck } from "./draft";

/** "auto": by the number of managers (1 solo, 2 single match, 3–5 league, 6–8 knockout). */
export type FootballMode = "auto" | "h2h_single" | "h2h_bo3" | "league" | "knockout" | "solo";

export type FootballRules = {
  /** Seconds per draft pick (10–60). */
  turnSeconds: number;
  mode: FootballMode;
  draftLuck: DraftLuck;
  chemistry: boolean;
  formationsOffered: 3 | 5;
  subs: 5 | 7;
  /** After the draft, before kickoff (30–180 s). */
  arrangeSeconds: number;
  /** Half-time and extra-time breaks (20–90 s). */
  halfTimeSeconds: number;
  /** Real time a 45-minute half takes to play (20–600 s; Quick 40, Standard 60, Long 120, Full 240). */
  playbackSecondsPerHalf: number;
  /**
   * Highlights: quiet minutes fly by and attacks play out slower, same total length (Best,
   * Oct 2026: on by default). Off: every minute takes the same time.
   */
  highlights: boolean;
  subsPerMatch: 3 | 5;
  /** Between league rounds, knockout ties and solo matches (15–90 s). */
  betweenMatchesSeconds: number;
};

export const footballNaija: FootballRules = {
  turnSeconds: 20,
  mode: "auto",
  draftLuck: "balanced",
  chemistry: true,
  formationsOffered: 5,
  subs: 7,
  arrangeSeconds: 90,
  halfTimeSeconds: 40,
  playbackSecondsPerHalf: 60,
  highlights: true,
  subsPerMatch: 5,
  betweenMatchesSeconds: 30,
};

/** The mode a room actually plays with `n` managers. */
export function modeFor(rules: FootballRules, n: number): Exclude<FootballMode, "auto"> {
  if (n === 1) return "solo";
  if (rules.mode !== "auto" && rules.mode !== "solo") {
    if (n === 2) return rules.mode === "h2h_bo3" ? "h2h_bo3" : "h2h_single";
    return rules.mode === "knockout"
      ? "knockout"
      : rules.mode === "league"
        ? "league"
        : n <= 5
          ? "league"
          : "knockout";
  }
  return n === 2 ? "h2h_single" : n <= 5 ? "league" : "knockout";
}

/** Minutes sent ahead of the playback (a modified phone sees at most this far ahead). */
export const LEAD_MINUTES = 3;
/**
 * How far behind the real minute clock a screen may fall: minutes with an attack in them play
 * slower so the build-up can be read, and the quiet minutes after catch up (`playback.ts`).
 */
export const PLAYBACK_SLACK_MINUTES = 1.5;
/** A penalty kick's playback time. */
export const PEN_MS = 1500;
/** Solo run: the bot XIs' team ratings, round by round (modes.md). */
export const SOLO_BANDS = [78, 81, 84, 87] as const;
/** Real time per match minute. */
export const msPerMinute = (rules: Pick<FootballRules, "playbackSecondsPerHalf">) =>
  (rules.playbackSecondsPerHalf * 1000) / 45;
