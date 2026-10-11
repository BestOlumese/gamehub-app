// The four one-tap touchline shouts (design: "4 shouts + Manage"), each a full tactic.
import { DEFAULT_TACTICS, type Tactics } from "./match";

export const SHOUTS = {
  /** Patient, high, more bodies forward. */
  attack: {
    ...DEFAULT_TACTICS,
    build: "short",
    defence: "balanced",
    line: 65,
    tempo: 65,
    inBox: 4,
  },
  /** Sit deep and stay compact. */
  hold: {
    ...DEFAULT_TACTICS,
    build: "balanced",
    defence: "deep_block",
    line: 30,
    tempo: 40,
    inBox: 2,
  },
  /** Win it back high up the pitch. */
  press: {
    ...DEFAULT_TACTICS,
    build: "short",
    defence: "high_press",
    line: 70,
    tempo: 60,
    inBox: 3,
  },
  /** Let them come, then break at pace. */
  counter: {
    ...DEFAULT_TACTICS,
    build: "counter",
    defence: "mid_block",
    line: 40,
    tempo: 55,
    inBox: 3,
  },
} as const satisfies Record<string, Tactics>;

export type Shout = keyof typeof SHOUTS;
export const SHOUT_IDS = Object.keys(SHOUTS) as Shout[];
