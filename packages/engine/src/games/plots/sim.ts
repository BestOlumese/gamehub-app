// Plays whole games with bots, outside a room: property tests and the balance simulation.
import { seededRng } from "../../rng";
import type { BotLevel, GameEvent, SeatIndex } from "../../types";
import { GROUP_SPACES, groupOf, SPACES } from "./board";
import { BAIL_CARD } from "./cards";
import { plots } from "./index";
import type { PlotsRules } from "./rules";
import type { PlotsAction, PlotsState } from "./state";

export const T0 = 1_000_000;

/** Money and buildings are never created or lost, and the board stays legal. Throws if not. */
export function checkInvariants(s: PlotsState, rules: PlotsRules) {
  const cash = s.cash.reduce((a, b) => a + b, 0);
  // Everything players hold (plus the Owambe pot) = what they started with + paid out − paid in.
  if (cash + s.jackpot !== rules.startCash * s.players + s.ledger.bankOut - s.ledger.bankIn)
    throw new Error(
      `money: ${cash} + ${s.jackpot} ≠ start + ${s.ledger.bankOut} − ${s.ledger.bankIn}`,
    );
  if (s.cash.some((x) => x < 0)) throw new Error(`negative cash ${s.cash}`);
  let houses = 0;
  let hotels = 0;
  for (let i = 0; i < SPACES.length; i++) {
    const h = s.houses[i] ?? 0;
    if (h === 5) hotels++;
    else houses += h;
    const o = s.owner[i];
    if (o !== null && o !== undefined && s.out.includes(o)) throw new Error(`bankrupt owns ${i}`);
    if (h > 0) {
      const g = groupOf(i);
      if (!g || GROUP_SPACES[g].some((j) => s.owner[j] !== o || s.mortgaged[j]))
        throw new Error(`building on ${i} without a clean full group`);
    }
  }
  if (houses + s.bank.houses !== rules.houseSupply)
    throw new Error(`houses ${houses} + ${s.bank.houses}`);
  if (hotels + s.bank.hotels !== rules.hotelSupply)
    throw new Error(`hotels ${hotels} + ${s.bank.hotels}`);
  for (const deck of ["gist", "hustle"] as const) {
    const held = s.bail[deck] === null ? 0 : 1;
    const ids = [...s.decks[deck]].sort((a, b) => a - b);
    if (ids.length + held !== 16 || new Set(ids).size !== ids.length)
      throw new Error(`deck ${deck}: ${ids}`);
    if (held && ids.includes(BAIL_CARD[deck])) throw new Error(`bail card in two places`);
  }
}

export type SimResult = {
  state: PlotsState;
  actions: number;
  events: GameEvent[];
  /** Server time at the end. */
  now: number;
};

/**
 * One game, every seat a bot. Time moves `stepMs` per action, and each auction bidder gets one
 * chance per round (as the room's alarms would give them).
 */
export function simulate(
  rules: PlotsRules,
  players: number,
  seed: string,
  opts: {
    levels?: BotLevel[];
    stepMs?: number;
    maxActions?: number;
    check?: boolean;
    keepEvents?: boolean;
    /** Stop (game not over) once this many turns have started. */
    stopAfterTurns?: number;
    /** Called after every action (balance stats). */
    onState?: (s: PlotsState) => void;
  } = {},
): SimResult {
  const rng = seededRng(seed);
  const levels = opts.levels ?? Array<BotLevel>(players).fill("medium");
  const step = opts.stepMs ?? 2000;
  let now = T0;
  let s = plots.setup(players, { rng, rules, now }, rng.int(players));
  const events: GameEvent[] = [];
  let actions = 0;
  const max = opts.maxActions ?? 20_000;
  while (!s.places && !(opts.stopAfterTurns && s.turns > opts.stopAfterTurns)) {
    if (++actions > max) throw new Error(`no end after ${max} actions (turn ${s.turns})`);
    now += step;
    const seat = plots.currentSeats(s)[0] as SeatIndex;
    let action: PlotsAction = plots.bots[levels[seat] ?? "medium"](s, seat, rules, rng);
    let res = plots.apply(s, { seat, action }, { rng, rules, now });
    if (!res.ok) {
      action = plots.timeoutAction(s, seat, rules, rng);
      res = plots.apply(s, { seat, action }, { rng, rules, now });
      if (!res.ok) throw new Error(`stuck: ${seat} ${JSON.stringify(action)} ${res.error}`);
    }
    s = res.state;
    if (opts.keepEvents) events.push(...res.events);
    if (opts.check) checkInvariants(s, rules);
    opts.onState?.(s);
    // Bots answer offers made to them, as the room does.
    for (let i = 0; i < players && !s.places; i++) {
      if (plots.currentSeats(s).includes(i)) continue;
      const reply = plots.botReply?.(s, i, rules);
      if (!reply) continue;
      const r = plots.apply(s, { seat: i, action: reply }, { rng, rules, now });
      if (r.ok) {
        s = r.state;
        if (opts.check) checkInvariants(s, rules);
      }
    }
  }
  return { state: s, actions, events, now };
}
