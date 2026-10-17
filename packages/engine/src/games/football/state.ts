// Football Draft room state, actions and views (docs/games/football-draft/modes.md, draft.md).
import type { SeatIndex } from "../../types";
import type { Group } from "./pitch";
import type {
  Instructions,
  MatchEvent,
  MatchState,
  MatchStats,
  MatchupPart,
  TeamSheet,
  Tactics,
} from "./match";
import type { FootballMode } from "./rules";
import type { Shout } from "./shouts";
import type { Reaction, Talk } from "./talk";
import type { FootballPlayer, Role } from "./types";

/** The options of one pick (hidden: only that manager's view, only while it's open). */
export type Offer =
  | { kind: "formation"; ids: number[] }
  | { kind: "captain"; ids: string[] }
  | { kind: "slot"; slot: number; ids: string[] }
  | { kind: "sub"; group: Group; ids: string[] };

export type Manager = {
  /** Picks made; the draft is done at `total`. */
  pick: number;
  total: number;
  formation: number | null;
  xi: Record<number, string>;
  subs: string[];
  offer: Offer | null;
  /** Server time this pick (or the arrange window) ends. */
  deadline: number | null;
  /** The team as it plays (after the draft): roles, tactics, lineup. */
  sheet: TeamSheet | null;
  ready: boolean;
  /** Server time of the last live change (one every 2 s at most). */
  lastChange: number;
  /** This break's team talk and how it went (yours alone; cleared at the restart). */
  talk?: { pick: Talk; reaction: Reaction; text: string } | null;
};

export type Side = "home" | "away";
/** A side of a fixture: a manager, or a bot XI (solo run). */
export type Team = { seat: SeatIndex } | { bot: number };

export type Fixture = {
  id: string;
  a: Team;
  b: Team | "bye";
  knockout: boolean;
  match: MatchState | null;
  /** This match's events so far (only those already sent). */
  log: MatchEvent[];
  /** Where the current half starts in `log` (views send the current half + earlier big moments). */
  halfFrom: number;
  /** The stats when the current half started (phones add what they've played back since). */
  base: MatchStats | null;
  /** Server time the current half (or shoot-out) started playing back. */
  startedAt: number;
  result: { score: [number, number]; pens: [number, number] | null; winner: 0 | 1 | "draw" } | null;
  /**
   * A tactical timeout in progress: the match is frozen from `at` until `until` (or until the
   * caller resumes); when it ends, `startedAt` moves on by the time paused.
   */
  pause?: { at: number; until: number; by: 0 | 1 } | null;
  /** Timeouts each side has called this match. */
  timeouts?: [number, number];
};

/** A solo-run opponent: a drafted bot XI with a fictional name. */
export type BotTeam = { name: string; sheet: TeamSheet; rating: number };

export type TableRow = {
  seat: SeatIndex;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
};

export type FootballPhase = "draft" | "live" | "break" | "between" | "over";

export type FootballState = {
  /** Seeds every stream (draft sets, matches). Never in a view. */
  seed: string;
  dataVersion: string;
  /** Real-time ms per match minute (from the rules, for views). */
  /** The screens' timing (shared timeline): the host's half length and highlights. */
  timing?: { halfMs: number; highlights: boolean };
  msPerMinute: number;
  mode: Exclude<FootballMode, "auto">;
  phase: FootballPhase;
  managers: Manager[];
  /** Rounds played and being played. */
  rounds: Fixture[][];
  round: number;
  /** The window (half-time, between matches) ends: server time. */
  windowEndsAt: number | null;
  /**
   * The round's matches are over on the server but still playing on screens (the server runs
   * up to 3 minutes ahead): the round ends at this time, so nobody misses the last goals.
   */
  roundEndsAt?: number | null;
  /** League table (league mode). */
  table: TableRow[];
  /** Solo run: opponents faced so far. */
  bots: BotTeam[];
  /** Best of 3: wins so far. */
  series: [number, number];
  places: SeatIndex[][] | null;
  /** A finished solo run: wins, matches played and the XI's average rating (for the profile). */
  soloRun?: { wins: number; played: number; teamRating: number };
};

export type SlotRef = { slot: number } | { bench: number };

export type FootballAction =
  | { type: "pick"; choice: string | number; slot?: number }
  | { type: "swap"; a: SlotRef; b: SlotRef }
  | { type: "role"; slot: number; role: Role; focus?: string }
  | { type: "tactics"; tactics: Tactics }
  | { type: "shout"; shout: Shout }
  | { type: "formation"; id: number }
  | { type: "ready" }
  | { type: "skip" }
  | { type: "talk"; talk: Talk }
  | { type: "instructions"; instructions: Instructions }
  /** A tactical timeout (2 a match; a solo run pauses at will), and ending your own early. */
  | { type: "timeout" }
  | { type: "resume" }
  /** Server only: play the next chunk of the live matches. */
  | { type: "tick" };

/** A card as sent to phones (the browser never downloads the whole database). */
export type Card = Pick<
  FootballPlayer,
  | "id"
  | "name"
  | "short"
  | "group"
  | "positions"
  | "ovr"
  | "stats"
  | "nation"
  | "club"
  | "league"
  | "era"
  | "potential"
  | "roles"
>;

export type FixtureView = {
  id: string;
  a: Team;
  b: Team | "bye";
  names: [string, string];
  /** The score, for every fixture (null before kickoff). */
  score: [number, number] | null;
  /** Both teams, once the match has kicked off (null before: hidden; null for fixtures not in focus). */
  teams: [TeamSheet, TeamSheet] | null;
  /** Live state of the teams (subs used, cards, fitness) once kicked off. */
  live: {
    score: [number, number];
    stats: MatchStats;
    half: number;
    minute: number;
    length: number;
    halfDone: boolean;
    subsUsed: [number, number];
    tactics: [Tactics, Tactics];
    xi: [string[], string[]];
    off: [string[], string[]];
    /** Stats when this half started; with the revealed events, the ticker without spoilers. */
    base: MatchStats;
    /** Each side's current team (after subs and changes), as a sheet. */
    now: [TeamSheet, TeamSheet];
    /** Stamina (0–100) of your own players on the pitch; null when you're not in this match. */
    fit: Record<string, number> | null;
    /** The style matchup both ways (side 0 attacking, side 1 attacking), for the meter and tips. */
    matchup: [MatchupPart[], MatchupPart[]];
  } | null;
  log: MatchEvent[];
  /** Rating changes from earlier halves (the phone adds what it has shown of this one). */
  ratingBase: Record<string, number> | null;
  /** A timeout in progress (the screen freezes at `at`). */
  pause: { at: number; until: number; by: 0 | 1 } | null;
  /** Timeouts each side has used this match. */
  timeouts: [number, number];
  startedAt: number;
  result: Fixture["result"];
};

export type FootballView = {
  mode: FootballState["mode"];
  phase: FootballPhase;
  dataVersion: string;
  you: SeatIndex | null;
  /** Your own draft and team (null for spectators). */
  me: Omit<Manager, "lastChange"> | null;
  managers: Array<{ pick: number; total: number; ready: boolean }>;
  rounds: FixtureView[][];
  round: number;
  windowEndsAt: number | null;
  table: TableRow[];
  series: [number, number];
  places: SeatIndex[][] | null;
  /** Ms of real time per match minute (for the playback). */
  /** The screens' timing, as the server plays it (the client never guesses it from rules). */
  timing: { halfMs: number; highlights: boolean };
  msPerMinute: number;
  /** The fixture shown in full (yours, or the first still playing). */
  focus: string | null;
  /** Every card this view mentions. */
  cards: Record<string, Card>;
};
