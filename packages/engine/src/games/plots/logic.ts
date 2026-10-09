// Naija Plots rules in action (docs/games/property.md): every change goes through these
// helpers on a mutable draft, so money and buildings stay accounted for.
import type { GameEvent, Rng, SeatIndex } from "../../types";
import {
  BUILD_COST,
  CHECKPOINT,
  GROUP_SPACES,
  groupOf,
  isOwnable,
  mortgageValue,
  OWAMBE,
  PAYDAY,
  POLICE_POST,
  priceOf,
  SPACES,
  TRANSPORTS,
  UTILITIES,
  type Deck,
} from "./board";
import { BAIL_CARD, CARDS } from "./cards";
import { activeSeats, netWorth, rentOf, sellValue, transferInterest, turnSeat } from "./core";
import type { PlotsRules } from "./rules";
import type { Bundle, PlotsState } from "./state";

/** Everything an action needs: the draft, rules, randomness, server time, events out. */
export type C = { d: PlotsState; rules: PlotsRules; rng: Rng; now: number; ev: GameEvent[] };

export const AUCTION_OPEN_EXTRA_MS = 4000;

// ---- Money ----

/** From the bank. */
export function gain(c: C, seat: SeatIndex, amount: number) {
  if (amount <= 0) return;
  c.d.cash[seat] = (c.d.cash[seat] ?? 0) + amount;
  c.d.ledger.bankOut += amount;
}

function pay(c: C, from: SeatIndex, to: SeatIndex | "bank", amount: number, fine: boolean) {
  const { d } = c;
  d.cash[from] = (d.cash[from] ?? 0) - amount;
  if (to !== "bank") d.cash[to] = (d.cash[to] ?? 0) + amount;
  else if (fine && c.rules.owambeJackpot) d.jackpot += amount;
  else d.ledger.bankIn += amount;
}

/** Pay now if they can; otherwise it's a debt they must raise money for (or go bankrupt). */
export function charge(
  c: C,
  from: SeatIndex,
  to: SeatIndex | "bank",
  amount: number,
  fine = false,
) {
  if (amount <= 0 || from === to) return;
  if ((c.d.cash[from] ?? 0) >= amount) {
    pay(c, from, to, amount, fine);
    c.ev.push({ type: "paid", from, to, amount });
  } else {
    c.d.debts.push({ from, to, amount, ...(fine ? { fine: true } : {}) });
    c.ev.push({ type: "owes", from, to, amount });
  }
}

/** Pays off debts in order while the debtor has the cash, then carries on. */
export function settle(c: C): void {
  const { d } = c;
  for (let debt = d.debts[0]; debt; debt = d.debts[0]) {
    if ((d.cash[debt.from] ?? 0) < debt.amount) return;
    d.debts.shift();
    pay(c, debt.from, debt.to, debt.amount, !!debt.fine);
    c.ev.push({ type: "paid", from: debt.from, to: debt.to, amount: debt.amount });
  }
  resume(c);
}

// ---- Moving and landing ----

export function sendToPolice(c: C, seat: SeatIndex) {
  const { d } = c;
  d.pos[seat] = POLICE_POST;
  d.detained[seat] = 0;
  if (turnSeat(d) === seat) {
    d.again = false;
    d.doubles = 0;
    d.step = "manage";
  }
  c.ev.push({ type: "police", seat });
}

/** Forward `steps` squares, with salary for passing (or landing on) Payday, then land. */
export function moveBy(c: C, seat: SeatIndex, steps: number, mod: LandMod = {}) {
  const { d, rules } = c;
  const from = d.pos[seat] ?? 0;
  const to = (from + steps) % SPACES.length;
  d.pos[seat] = to;
  c.ev.push({ type: "moved", seat, from, to, steps });
  if (from + steps >= SPACES.length) {
    const salary =
      to === PAYDAY && rules.doubleSalaryOnExactLanding ? rules.salary * 2 : rules.salary;
    gain(c, seat, salary);
    c.ev.push({ type: "salary", seat, amount: salary });
  }
  land(c, seat, mod);
}

type LandMod = { doubleRent?: boolean; utilityRoll?: boolean };

function land(c: C, seat: SeatIndex, mod: LandMod) {
  const { d, rules } = c;
  const at = d.pos[seat] ?? 0;
  const sp = SPACES[at];
  if (!sp) return;
  switch (sp.kind) {
    case "owambe":
      if (rules.owambeJackpot && d.jackpot > 0 && at === OWAMBE) {
        d.cash[seat] = (d.cash[seat] ?? 0) + d.jackpot;
        c.ev.push({ type: "jackpot", seat, amount: d.jackpot });
        d.jackpot = 0;
      }
      return;
    case "checkpoint":
      if (at === CHECKPOINT) sendToPolice(c, seat);
      return;
    case "tax":
      charge(c, seat, "bank", sp.amount, true);
      return;
    case "card":
      drawCard(c, seat, sp.deck);
      return;
    case "plot":
    case "transport":
    case "utility": {
      const owner = d.owner[at];
      if (owner === null || owner === undefined) {
        if (turnSeat(d) === seat) d.step = "buy";
        return;
      }
      if (owner === seat || d.mortgaged[at]) return;
      if (!rules.rentWhileDetained && d.detained[owner] !== null) return;
      let dice = (d.dice?.[0] ?? 0) + (d.dice?.[1] ?? 0);
      let rent: number;
      if (mod.utilityRoll) {
        const r: [number, number] = [c.rng.int(6) + 1, c.rng.int(6) + 1];
        dice = r[0] + r[1];
        c.ev.push({ type: "rolled", seat, dice: r, extra: true });
        rent = 15 * dice;
      } else rent = rentOf(d, at, dice, rules);
      if (mod.doubleRent) rent *= 2;
      if (rent > 0) {
        c.ev.push({ type: "rent", from: seat, to: owner, space: at, amount: rent });
        charge(c, seat, owner, rent);
      }
      return;
    }
    default:
      return;
  }
}

function drawCard(c: C, seat: SeatIndex, deck: Deck) {
  const { d } = c;
  const id = d.decks[deck].shift();
  if (id === undefined) return;
  const card = CARDS[deck][id];
  if (!card) return;
  d.card = { deck, id, seat };
  c.ev.push({ type: "card", seat, deck, id });
  if (id === BAIL_CARD[deck]) d.bail[deck] = seat;
  else d.decks[deck].push(id);
  const e = card.effect;
  const pos = d.pos[seat] ?? 0;
  switch (e.k) {
    case "collect":
      gain(c, seat, e.amount);
      return;
    case "pay":
      charge(c, seat, "bank", e.amount, true);
      return;
    case "advance":
      moveBy(c, seat, (e.to - pos + SPACES.length) % SPACES.length || SPACES.length);
      return;
    case "back": {
      const to = (pos - e.n + SPACES.length) % SPACES.length;
      d.pos[seat] = to;
      c.ev.push({ type: "moved", seat, from: pos, to, steps: -e.n });
      land(c, seat, {});
      return;
    }
    case "nearest": {
      const list = e.kind === "transport" ? TRANSPORTS : UTILITIES;
      const target = list.find((i) => i > pos) ?? (list[0] as number);
      const mod: LandMod = e.kind === "transport" ? { doubleRent: true } : { utilityRoll: true };
      moveBy(c, seat, (target - pos + SPACES.length) % SPACES.length, mod);
      return;
    }
    case "repairs": {
      let total = 0;
      for (let i = 0; i < SPACES.length; i++) {
        if (d.owner[i] !== seat) continue;
        const h = d.houses[i] ?? 0;
        total += h === 5 ? e.hotel : h * e.house;
      }
      charge(c, seat, "bank", total, true);
      return;
    }
    case "police":
      sendToPolice(c, seat);
      return;
    case "bail":
      return;
    case "pay_each":
      for (const o of activeSeats(d)) if (o !== seat) charge(c, seat, o, e.amount);
      return;
    case "collect_each":
      for (const o of activeSeats(d)) if (o !== seat) charge(c, o, seat, e.amount);
      return;
  }
}

// ---- Turns ----

export function roll(c: C, seat: SeatIndex) {
  const { d, rules, now } = c;
  if (d.endsAt === null)
    d.endsAt =
      now + (rules.mode === "timed" ? rules.timedMinutes : rules.classicCapHours * 60) * 60_000;
  const dice: [number, number] = [c.rng.int(6) + 1, c.rng.int(6) + 1];
  d.dice = dice;
  d.card = null;
  const double = dice[0] === dice[1];
  const sum = dice[0] + dice[1];
  c.ev.push({ type: "rolled", seat, dice });
  d.step = "manage";
  const tries = d.detained[seat];
  if (tries !== null && tries !== undefined) {
    d.again = false;
    if (double) {
      d.detained[seat] = null;
      c.ev.push({ type: "released", seat, how: "doubles" });
      moveBy(c, seat, sum);
    } else if (tries + 1 >= rules.maxDetainedTurns) {
      d.detained[seat] = null;
      c.ev.push({ type: "released", seat, how: "fine" });
      charge(c, seat, "bank", rules.policeFine, true);
      moveBy(c, seat, sum);
    } else d.detained[seat] = tries + 1;
    return;
  }
  if (double) {
    d.doubles++;
    if (rules.threeDoublesToPolice && d.doubles >= 3) {
      sendToPolice(c, seat);
      return;
    }
  }
  d.again = double && rules.doublesRollAgain;
  moveBy(c, seat, sum);
  if (d.step === "manage" && d.again && d.detained[seat] === null) d.step = "roll";
}

/** After a buy/decline (or the auction it started): roll again on doubles, else manage. */
export function afterDecision(c: C) {
  c.d.step = c.d.again ? "roll" : "manage";
}

/** Next player's turn, or the end of the game (one player left, or the last round is done). */
export function nextTurn(c: C): void {
  const { d } = c;
  d.doubles = 0;
  d.again = false;
  d.card = null;
  const active = activeSeats(d);
  if (active.length <= 1) return finish(c);
  let i = d.turn;
  let wrapped = false;
  do {
    i = (i + 1) % d.order.length;
    if (i <= d.turn) wrapped = true;
  } while (d.out.includes(d.order[i] as SeatIndex));
  if (d.lastRound && wrapped) return finish(c);
  d.turn = i;
  d.step = "roll";
  d.turns++;
  c.ev.push({ type: "turn", seat: d.order[i] });
}

/** Once the clock runs out: the round is finished, then the game ends. */
export function checkClock(c: C) {
  const { d, now } = c;
  if (d.places || d.lastRound || d.endsAt === null || now < d.endsAt) return;
  d.lastRound = true;
  c.ev.push({ type: "last_round" });
}

/** Carries on after an auction, a debt or a bankruptcy is dealt with. */
export function resume(c: C): void {
  const { d } = c;
  if (d.places || d.auction || d.debts.length) return;
  const next = d.auctionQueue.shift();
  if (next !== undefined) return startAuction(c, next);
  if (d.out.includes(turnSeat(d))) nextTurn(c);
}

// ---- Auctions ----

export const auctionBidders = (d: Pick<PlotsState, "auction" | "order" | "out">): SeatIndex[] =>
  d.auction ? activeSeats(d).filter((x) => !d.auction?.out.includes(x) && x !== d.auction?.by) : [];

export function startAuction(c: C, space: number): void {
  const { d, rules, now } = c;
  if (!rules.auctions) return resume(c);
  const out = activeSeats(d).filter((x) => (d.cash[x] ?? 0) < rules.minBidIncrement);
  if (out.length >= activeSeats(d).length) {
    c.ev.push({ type: "auction_unsold", space });
    return resume(c);
  }
  d.auction = {
    space,
    high: 0,
    by: null,
    endsAt: now + rules.auctionSecondsPerBid * 1000 + AUCTION_OPEN_EXTRA_MS,
    out,
  };
  c.ev.push({ type: "auction_started", space });
}

export function endAuction(c: C): void {
  const { d } = c;
  const a = d.auction;
  if (!a) return;
  d.auction = null;
  if (a.by !== null) {
    d.cash[a.by] = (d.cash[a.by] ?? 0) - a.high;
    d.ledger.bankIn += a.high;
    d.owner[a.space] = a.by;
    c.ev.push({ type: "auction_won", seat: a.by, space: a.space, amount: a.high });
  } else c.ev.push({ type: "auction_unsold", space: a.space });
  resume(c);
}

// ---- Building and mortgages ----

export function build(c: C, seat: SeatIndex, space: number) {
  const { d } = c;
  const g = groupOf(space);
  if (!g) return;
  const h = d.houses[space] ?? 0;
  d.cash[seat] = (d.cash[seat] ?? 0) - BUILD_COST[g];
  d.ledger.bankIn += BUILD_COST[g];
  d.houses[space] = h + 1;
  if (h + 1 === 5) {
    d.bank.hotels--;
    d.bank.houses += 4;
  } else d.bank.houses--;
  c.ev.push({ type: "built", seat, space, level: h + 1 });
}

/** One level down; a hotel goes back to as many houses as the bank can give (up to 4). */
export function sellBuilding(c: C, seat: SeatIndex, space: number) {
  const { d } = c;
  const h = d.houses[space] ?? 0;
  let level: number;
  if (h === 5) {
    level = Math.min(4, d.bank.houses);
    d.bank.hotels++;
    d.bank.houses -= level;
  } else {
    level = h - 1;
    d.bank.houses++;
  }
  d.houses[space] = level;
  gain(c, seat, (h - level) * sellValue(space));
  c.ev.push({ type: "sold", seat, space, level });
}

export function mortgage(c: C, seat: SeatIndex, space: number) {
  c.d.mortgaged[space] = true;
  gain(c, seat, mortgageValue(space));
  c.ev.push({ type: "mortgaged", seat, space });
}

/** Raises what the first debt needs: buildings first (cheapest groups), then mortgages (cheapest plots). */
export function raiseCash(c: C, seat: SeatIndex, need: number): boolean {
  const { d } = c;
  const mine = () => d.owner.flatMap((o, i) => (o === seat ? [i] : []));
  while ((d.cash[seat] ?? 0) < need) {
    // Sell from the most built-up plot of the cheapest group with buildings (keeps building even).
    const built = mine()
      .filter((i) => (d.houses[i] ?? 0) > 0)
      .sort((a, b) => sellValue(a) - sellValue(b) || (d.houses[b] ?? 0) - (d.houses[a] ?? 0));
    const top = built[0];
    if (top !== undefined) {
      const g = groupOf(top);
      const peak = g ? GROUP_SPACES[g].reduce((m, i) => Math.max(m, d.houses[i] ?? 0), 0) : 0;
      const pick = g ? (GROUP_SPACES[g].find((i) => (d.houses[i] ?? 0) === peak) ?? top) : top;
      sellBuilding(c, seat, pick);
      continue;
    }
    const plot = mine()
      .filter((i) => !d.mortgaged[i])
      .sort((a, b) => priceOf(a) - priceOf(b))[0];
    if (plot === undefined) return false;
    mortgage(c, seat, plot);
  }
  return true;
}

// ---- Trades ----

/** Hands a bundle over: cash, plots (mortgages stay, interest per the rules) and Bail cards. */
export function transferPlots(c: C, from: SeatIndex, to: SeatIndex, b: Bundle) {
  const { d, rules } = c;
  d.cash[from] = (d.cash[from] ?? 0) - b.cash;
  d.cash[to] = (d.cash[to] ?? 0) + b.cash;
  for (const p of b.plots) {
    d.owner[p] = to;
    if (d.mortgaged[p] && rules.mortgageTransferInterest === "immediate")
      charge(c, to, "bank", transferInterest(p, rules));
  }
  let bail = b.bail;
  for (const deck of ["gist", "hustle"] as const)
    if (bail > 0 && d.bail[deck] === from) {
      d.bail[deck] = to;
      bail--;
    }
}

// ---- Bankruptcy and the end ----

/** Out of the game: everything goes to the creditor (a player) or back to the bank (auctioned). */
export function bankrupt(c: C, seat: SeatIndex, to: SeatIndex | "bank"): void {
  const { d, rules } = c;
  // Buildings go back to the bank at half price first.
  for (let i = 0; i < SPACES.length; i++) {
    if (d.owner[i] !== seat) continue;
    const h = d.houses[i] ?? 0;
    if (!h) continue;
    gain(c, seat, h * sellValue(i));
    if (h === 5) d.bank.hotels++;
    else d.bank.houses += h;
    d.houses[i] = 0;
  }
  d.debts = d.debts.filter((x) => x.from !== seat);
  const cash = d.cash[seat] ?? 0;
  d.cash[seat] = 0;
  const plots = d.owner.flatMap((o, i) => (o === seat ? [i] : []));
  if (to !== "bank" && !d.out.includes(to)) {
    d.cash[to] = (d.cash[to] ?? 0) + cash;
    for (const p of plots) {
      d.owner[p] = to;
      if (d.mortgaged[p] && rules.mortgageTransferInterest === "immediate")
        charge(c, to, "bank", transferInterest(p, rules));
    }
    for (const deck of ["gist", "hustle"] as const) if (d.bail[deck] === seat) d.bail[deck] = to;
  } else {
    d.ledger.bankIn += cash;
    for (const p of plots) {
      d.owner[p] = null;
      d.mortgaged[p] = false;
      d.auctionQueue.push(p);
    }
    for (const deck of ["gist", "hustle"] as const)
      if (d.bail[deck] === seat) {
        d.bail[deck] = null;
        d.decks[deck].push(BAIL_CARD[deck]);
      }
  }
  d.out.push(seat);
  d.detained[seat] = null;
  d.offers = d.offers.filter((o) => o.from !== seat && o.to !== seat);
  c.ev.push({ type: "bankrupt", seat, to });
  if (activeSeats(d).length <= 1) return finish(c);
  resume(c);
}

/** Places: players still in by net worth (then cash, then a coin flip), then the bankrupt, last out first. */
export function finish(c: C): void {
  const { d, rules, rng } = c;
  if (d.places) return;
  d.auction = null;
  d.debts = [];
  const flip = new Map(activeSeats(d).map((x) => [x, rng.int(1_000_000)]));
  const live = activeSeats(d).sort(
    (a, b) =>
      netWorth(d, b, rules) - netWorth(d, a, rules) ||
      (d.cash[b] ?? 0) - (d.cash[a] ?? 0) ||
      (flip.get(a) ?? 0) - (flip.get(b) ?? 0),
  );
  d.places = [...live.map((x) => [x]), ...[...d.out].reverse().map((x) => [x])];
  c.ev.push({
    type: "game_over",
    places: d.places,
    worth: live.map((x) => netWorth(d, x, rules)),
  });
}

export { isOwnable, priceOf };
