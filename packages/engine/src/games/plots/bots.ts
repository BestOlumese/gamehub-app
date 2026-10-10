// Naija Plots bots (docs/games/property.md → Bots). All plain arithmetic over the board: well
// under a millisecond a decision.
import type { BotLevel, Rng, SeatIndex } from "../../types";
import { GROUP_SPACES, groupOf, houseCost, priceOf, SPACES, TRANSPORTS } from "./board";
import {
  activeSeats,
  bailCount,
  plotsOf,
  turnSeat,
  unmortgageCost,
  whyNotBuild,
  whyNotBundle,
  whyNotUnmortgage,
} from "./core";
import { auctionBidders } from "./logic";
import type { PlotsRules } from "./rules";
import type { Bundle, Offer, PlotsAction, PlotsState } from "./state";

/**
 * How often each part of the board is landed on, roughly: the groups just after the Police Post
 * (Sunset, Palm) and the transport spaces the most (Markov-chain studies of this kind of board).
 */
const WEIGHT: Record<string, number> = {
  clay: 0.9,
  sky: 0.95,
  coral: 1.05,
  sunset: 1.15,
  palm: 1.12,
  gold: 1.05,
  forest: 1,
  royal: 0.95,
};

const round10 = (x: number) => Math.round(x / 10) * 10;
const isLate = (s: PlotsState) => s.turns > 12 * activeSeats(s).length;
const reserve = (s: PlotsState) => (isLate(s) ? 300 : 150);

/** What a plot is worth to `seat` (₦k): price, more if it completes or blocks a group. */
export function value(s: PlotsState, space: number, seat: SeatIndex, level: BotLevel): number {
  const price = priceOf(space);
  const sp = SPACES[space];
  if (!sp) return 0;
  if (sp.kind === "transport") {
    const mine = TRANSPORTS.filter((i) => s.owner[i] === seat && i !== space).length;
    return price * (1 + 0.15 * mine) * (level === "hard" ? 1.15 : 1);
  }
  if (sp.kind === "utility") return price * 0.9;
  const g = groupOf(space);
  if (!g) return price;
  const others = GROUP_SPACES[g].filter((i) => i !== space);
  let bonus = 0;
  if (others.every((i) => s.owner[i] === seat)) bonus += 0.4;
  const rival = s.owner[others[0] as number];
  if (
    rival !== null &&
    rival !== undefined &&
    rival !== seat &&
    others.every((i) => s.owner[i] === rival)
  )
    bonus += 0.25;
  const weight = level === "easy" ? 1 : (WEIGHT[g] ?? 1) ** (level === "hard" ? 2 : 1);
  return price * (1 + bonus) * weight;
}

/** Would owning `space` give `seat` the whole group? */
const completes = (s: PlotsState, space: number, seat: SeatIndex) => {
  const g = groupOf(space);
  return !!g && GROUP_SPACES[g].every((i) => i === space || s.owner[i] === seat);
};

/** Value of a trade bundle to whoever receives it (or loses it, from the giver's side). */
function bundleValue(
  s: PlotsState,
  b: Bundle,
  seat: SeatIndex,
  level: BotLevel,
  rules: PlotsRules,
) {
  let v = b.cash + b.bail * rules.policeFine;
  for (const p of b.plots) v += value(s, p, seat, level) * (s.mortgaged[p] ? 0.5 : 1);
  return v;
}

/** Accept an offer to `seat`? Easy: any gain; Medium 10 %; Hard by its own valuation, 5 %. */
export function wantsOffer(
  s: PlotsState,
  o: Offer,
  seat: SeatIndex,
  level: BotLevel,
  rules: PlotsRules,
): boolean {
  if (whyNotBundle(s, o.from, o.give) || whyNotBundle(s, seat, o.get)) return false;
  const gets = bundleValue(s, o.give, seat, level, rules);
  const gives = bundleValue(s, o.get, seat, level, rules);
  // Don't hand someone the last plot of a group cheaply, unless it completes one of ours too.
  const completesTheirs = o.get.plots.some((p) => completes(s, p, o.from));
  const completesMine = o.give.plots.some((p) => completes(s, p, seat));
  const need = level === "easy" ? 1 : level === "medium" ? 1.1 : 1.05;
  return (
    gets > gives * (completesTheirs && !completesMine ? 1.5 : need) &&
    (s.cash[seat] ?? 0) - o.get.cash >= 0
  );
}

function bid(
  s: PlotsState,
  seat: SeatIndex,
  level: BotLevel,
  rules: PlotsRules,
  rng: Rng,
): PlotsAction {
  const a = s.auction;
  if (!a) return { type: "pass_bid" };
  const price = priceOf(a.space);
  const max =
    level === "easy"
      ? price * 0.8
      : Math.min(
          value(s, a.space, seat, level) * (level === "medium" ? 0.9 : 1),
          (s.cash[seat] ?? 0) - reserve(s) / 2,
        );
  const min = a.by === null ? rules.minBidIncrement : a.high + rules.minBidIncrement;
  if (min > max || min > (s.cash[seat] ?? 0)) return { type: "pass_bid" };
  if (level === "easy" && rng.int(5) === 0) return { type: "pass_bid" };
  // Bid in steps of about a tenth of the price, so auctions between bots don't drag on.
  const step = Math.max(rules.minBidIncrement, round10(price / 10));
  const amount = Math.min(
    Math.floor(max),
    a.by === null ? Math.max(min, round10(price / 2)) : a.high + step,
  );
  return { type: "bid", amount: Math.max(min, Math.min(amount, s.cash[seat] ?? 0)) };
}

function wantsToBuy(s: PlotsState, seat: SeatIndex, level: BotLevel): boolean {
  const space = s.pos[seat] ?? 0;
  const price = priceOf(space);
  const cash = s.cash[seat] ?? 0;
  if (cash < price) return false;
  if (level === "easy") return cash - price > 100;
  const v = value(s, space, seat, level);
  return cash - price >= reserve(s) || (v >= price * 1.39 && cash - price >= 20);
}

/** A house to build now, if the bot wants one: up to 3 houses everywhere first (best return). */
function toBuild(
  s: PlotsState,
  seat: SeatIndex,
  level: BotLevel,
  rules: PlotsRules,
): number | null {
  const cash = s.cash[seat] ?? 0;
  const keep = level === "easy" ? 300 : reserve(s);
  const options = plotsOf(s, seat)
    .filter((p) => !whyNotBuild(s, p, seat, rules))
    .filter((p) => {
      const g = groupOf(p);
      return !!g && cash - houseCost(p, (s.houses[p] ?? 0) + 1) >= keep;
    })
    .sort((a, b) => (s.houses[a] ?? 0) - (s.houses[b] ?? 0) || priceOf(b) - priceOf(a));
  const pick = options[0];
  if (pick === undefined) return null;
  // Past 3 houses only with plenty to spare.
  if (level !== "easy" && (s.houses[pick] ?? 0) >= 3 && cash < 2 * reserve(s) + 200) return null;
  return pick;
}

/** The one plot `seat` lacks in a group (no buildings there), and who has it. */
function wanted(s: PlotsState, seat: SeatIndex): Array<{ plot: number; from: SeatIndex }> {
  const out: Array<{ plot: number; from: SeatIndex }> = [];
  for (const spaces of Object.values(GROUP_SPACES)) {
    const missing = spaces.filter((i) => s.owner[i] !== seat);
    if (missing.length !== 1 || spaces.some((i) => (s.houses[i] ?? 0) > 0)) continue;
    if (!spaces.some((i) => s.owner[i] === seat)) continue;
    const p = missing[0] as number;
    const o = s.owner[p];
    if (o === null || o === undefined || o === seat || s.out.includes(o)) continue;
    out.push({ plot: p, from: o });
  }
  return out;
}

/**
 * Medium and Hard propose trades (once per 10 turns per player): a swap where each side
 * completes a group, evened up with cash; else cash alone, well over the price, for the plot
 * that completes one of theirs (Hard pays a little more).
 */
function proposal(
  s: PlotsState,
  seat: SeatIndex,
  level: BotLevel,
  rules: PlotsRules,
): PlotsAction | null {
  if (!rules.trading || s.offers.filter((o) => o.from === seat).length >= 2) return null;
  const cash = s.cash[seat] ?? 0;
  for (const { plot, from: o } of wanted(s, seat)) {
    const key = `${seat}>${o}`;
    if (s.turns - (s.proposals[key] ?? -100) < 10) continue;
    if (s.offers.some((x) => x.from === seat && x.to === o)) continue;
    // A swap: something of ours that completes one of their groups.
    const theirs = wanted(s, o).find((w) => w.from === seat && groupOf(w.plot) !== groupOf(plot));
    if (theirs) {
      const diff = round10(priceOf(plot) - priceOf(theirs.plot));
      const give = { cash: Math.max(0, diff), plots: [theirs.plot], bail: 0 };
      const get = { cash: Math.max(0, -diff), plots: [plot], bail: 0 };
      if (give.cash <= cash && get.cash <= (s.cash[o] ?? 0))
        return { type: "offer", to: o, give, get };
    }
    const offerCash = round10(priceOf(plot) * (level === "hard" ? 2.4 : 2.2));
    if (cash - offerCash < reserve(s)) continue;
    return {
      type: "offer",
      to: o,
      give: { cash: offerCash, plots: [], bail: 0 },
      get: { cash: 0, plots: [plot], bail: 0 },
    };
  }
  return null;
}

/** A bot's next action for `seat` (whatever the room is waiting on it for). */
export function botAction(
  s: PlotsState,
  seat: SeatIndex,
  rules: PlotsRules,
  level: BotLevel,
  rng: Rng,
): PlotsAction {
  if (s.auction && auctionBidders(s).includes(seat)) return bid(s, seat, level, rules, rng);
  if (s.debts[0]?.from === seat) return { type: "auto_pay" };
  // Answer offers made to it first.
  const offer = s.offers.find((o) => o.to === seat);
  if (offer && !s.auction && !s.debts.length)
    return wantsOffer(s, offer, seat, level, rules)
      ? { type: "accept_offer", id: offer.id }
      : { type: "decline_offer", id: offer.id };
  if (turnSeat(s) !== seat) return { type: "end_turn" };
  const cash = s.cash[seat] ?? 0;
  switch (s.step) {
    case "roll": {
      if (s.detained[seat] !== null && s.detained[seat] !== undefined) {
        const stay = level !== "easy" && isLate(s);
        if (!stay && bailCount(s, seat) > 0) return { type: "use_bail" };
        if (!stay && cash - rules.policeFine >= reserve(s)) return { type: "pay_fine" };
      }
      return { type: "roll" };
    }
    case "buy":
      return wantsToBuy(s, seat, level) ? { type: "buy" } : { type: "decline" };
    case "manage": {
      const b = toBuild(s, seat, level, rules);
      if (b !== null) return { type: "build", space: b };
      if (level !== "easy") {
        const um = plotsOf(s, seat).find(
          (p) =>
            s.mortgaged[p] &&
            !whyNotUnmortgage(s, p, seat, rules) &&
            cash - unmortgageCost(p, rules) >= 2 * reserve(s),
        );
        if (um !== undefined) return { type: "unmortgage", space: um };
      }
      if (level !== "easy") {
        const p = proposal(s, seat, level, rules);
        if (p) return p;
      }
      return { type: "end_turn" };
    }
  }
}
