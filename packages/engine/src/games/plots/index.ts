import { err, ok } from "../../result";
import type { GameDefinition, GameEvent, RuleErrorCode, SeatIndex } from "../../types";
import { priceOf, SPACES } from "./board";
import { BAIL_CARD } from "./cards";
import { botAction, wantsOffer } from "./bots";
import {
  activeSeats,
  bailCount,
  canManageNow,
  emptyBundle,
  turnSeat,
  unmortgageCost,
  whyNotBuild,
  whyNotBundle,
  whyNotMortgage,
  whyNotSell,
  whyNotUnmortgage,
} from "./core";
import {
  afterDecision,
  auctionBidders,
  bankrupt,
  build,
  checkClock,
  endAuction,
  mortgage,
  nextTurn,
  raiseCash,
  roll,
  sellBuilding,
  settle,
  startAuction,
  tradeBundles,
  type C,
} from "./logic";
import { plotsNaija, type PlotsRules } from "./rules";
import { plotsActionSchema, plotsRulesSchema } from "./schemas";
import type { PlotsAction, PlotsState, PlotsView } from "./state";

/** Extra time on each action deadline for dice and token animations on the phones. */
const ANIM_MS = 3000;
const OFFER_MS = 60_000;
const MAX_OPEN_OFFERS = 2;

function draft(s: PlotsState): PlotsState {
  return {
    ...s,
    order: [...s.order],
    pos: [...s.pos],
    cash: [...s.cash],
    owner: [...s.owner],
    houses: [...s.houses],
    mortgaged: [...s.mortgaged],
    bank: { ...s.bank },
    bail: { ...s.bail },
    detained: [...s.detained],
    decks: { gist: [...s.decks.gist], hustle: [...s.decks.hustle] },
    debts: s.debts.map((d) => ({ ...d })),
    auction: s.auction ? { ...s.auction, out: [...s.auction.out] } : null,
    auctionQueue: [...s.auctionQueue],
    offers: [...s.offers],
    out: [...s.out],
    ledger: { ...s.ledger },
    proposals: { ...s.proposals },
  };
}

/** Who the game is waiting on: auction bidders, then the first debtor, then the player on turn. */
function waitingOn(s: PlotsState): SeatIndex[] {
  if (s.places) return [];
  if (s.auction) return auctionBidders(s);
  const debtor = s.debts[0]?.from;
  if (debtor !== undefined) return [debtor];
  return [turnSeat(s)];
}

/** May `seat` build, sell or mortgage now? On their own turn, or (sell/mortgage) to pay a debt. */
const canManage = canManageNow;

function apply(c: C, seat: SeatIndex, action: PlotsAction): RuleErrorCode | null {
  const { d, rules, now } = c;
  const onTurn = turnSeat(d) === seat && !d.auction && !d.debts.length;

  switch (action.type) {
    case "roll":
      if (!onTurn || d.step !== "roll") return "NOT_YOUR_TURN";
      roll(c, seat);
      return null;

    case "pay_fine":
      if (!onTurn || d.step !== "roll" || d.detained[seat] === null) return "NOT_ALLOWED";
      if ((d.cash[seat] ?? 0) < rules.policeFine) return "NOT_ALLOWED";
      d.detained[seat] = null;
      d.cash[seat] = (d.cash[seat] ?? 0) - rules.policeFine;
      if (rules.owambeJackpot) d.jackpot += rules.policeFine;
      else d.ledger.bankIn += rules.policeFine;
      c.ev.push({ type: "released", seat, how: "paid" });
      return null;

    case "use_bail": {
      if (!onTurn || d.step !== "roll" || d.detained[seat] === null) return "NOT_ALLOWED";
      const deck = (["gist", "hustle"] as const).find((x) => d.bail[x] === seat);
      if (!deck) return "NOT_ALLOWED";
      d.bail[deck] = null;
      d.decks[deck].push(BAIL_CARD[deck]);
      d.detained[seat] = null;
      c.ev.push({ type: "released", seat, how: "bail" });
      return null;
    }

    case "buy": {
      if (!onTurn || d.step !== "buy") return "NOT_ALLOWED";
      const space = d.pos[seat] ?? 0;
      const price = priceOf(space);
      if ((d.cash[seat] ?? 0) < price) return "NOT_ALLOWED";
      d.cash[seat] = (d.cash[seat] ?? 0) - price;
      d.ledger.bankIn += price;
      d.owner[space] = seat;
      c.ev.push({ type: "bought", seat, space, amount: price });
      afterDecision(c);
      return null;
    }

    case "decline":
      if (!onTurn || d.step !== "buy") return "NOT_ALLOWED";
      afterDecision(c);
      startAuction(c, d.pos[seat] ?? 0);
      return null;

    case "bid": {
      const a = d.auction;
      if (!a || !auctionBidders(d).includes(seat)) return "NOT_ALLOWED";
      // Too late: the auction closed at its deadline (the server's clock decides).
      if (now >= a.endsAt) {
        endAuction(c);
        return null;
      }
      const min = a.by === null ? rules.minBidIncrement : a.high + rules.minBidIncrement;
      if (action.amount < min || action.amount > (d.cash[seat] ?? 0)) return "NOT_ALLOWED";
      a.high = action.amount;
      a.by = seat;
      a.endsAt = now + rules.auctionSecondsPerBid * 1000;
      c.ev.push({ type: "bid", seat, amount: action.amount });
      if (!auctionBidders(d).length) endAuction(c);
      return null;
    }

    case "pass_bid": {
      const a = d.auction;
      if (!a || !auctionBidders(d).includes(seat)) return "NOT_ALLOWED";
      if (now >= a.endsAt) {
        endAuction(c);
        return null;
      }
      a.out.push(seat);
      c.ev.push({ type: "passed", seat });
      if (!auctionBidders(d).length) endAuction(c);
      return null;
    }

    case "build":
      if (!canManage(d, seat, false)) return "NOT_ALLOWED";
      if (whyNotBuild(d, action.space, seat, rules)) return "NOT_ALLOWED";
      build(c, seat, action.space);
      return null;

    case "sell_building":
      if (!canManage(d, seat, true) || whyNotSell(d, action.space, seat, rules))
        return "NOT_ALLOWED";
      sellBuilding(c, seat, action.space);
      settle(c);
      return null;

    case "mortgage":
      if (!canManage(d, seat, true) || whyNotMortgage(d, action.space, seat)) return "NOT_ALLOWED";
      mortgage(c, seat, action.space);
      settle(c);
      return null;

    case "unmortgage": {
      if (!canManage(d, seat, false) || whyNotUnmortgage(d, action.space, seat, rules))
        return "NOT_ALLOWED";
      const cost = unmortgageCost(action.space, rules);
      d.cash[seat] = (d.cash[seat] ?? 0) - cost;
      d.ledger.bankIn += cost;
      d.mortgaged[action.space] = false;
      c.ev.push({ type: "unmortgaged", seat, space: action.space });
      return null;
    }

    case "offer": {
      const { to, give, get } = action;
      if (!rules.trading || d.auction || d.debts.length) return "NOT_ALLOWED";
      if (to === seat || !activeSeats(d).includes(to) || !activeSeats(d).includes(seat))
        return "NOT_ALLOWED";
      if (emptyBundle(give) && emptyBundle(get)) return "NOT_ALLOWED";
      if (d.offers.some((o) => o.from === seat && o.to === to)) return "NOT_ALLOWED";
      if (d.offers.filter((o) => o.from === seat).length >= MAX_OPEN_OFFERS) return "NOT_ALLOWED";
      if (whyNotBundle(d, seat, give) || whyNotBundle(d, to, get)) return "NOT_ALLOWED";
      const id = d.nextOfferId++;
      d.offers.push({ id, from: seat, to, give, get, expiresAt: now + OFFER_MS });
      d.proposals[`${seat}>${to}`] = d.turns;
      c.ev.push({ type: "offer_sent", id, from: seat, to });
      return null;
    }

    case "accept_offer": {
      const o = d.offers.find((x) => x.id === action.id);
      if (!o || o.to !== seat || d.auction || d.debts.length) return "NOT_ALLOWED";
      d.offers = d.offers.filter((x) => x.id !== o.id);
      if (whyNotBundle(d, o.from, o.give) || whyNotBundle(d, o.to, o.get)) {
        c.ev.push({ type: "offer_void", id: o.id, from: o.from, to: o.to });
        return null;
      }
      tradeBundles(c, o.from, o.to, o.give, o.get);
      // Offers that mention any of these plots no longer stand.
      const moved = new Set([...o.give.plots, ...o.get.plots]);
      d.offers = d.offers.filter(
        (x) => ![...x.give.plots, ...x.get.plots].some((p) => moved.has(p)),
      );
      c.ev.push({ type: "trade_done", id: o.id, from: o.from, to: o.to, give: o.give, get: o.get });
      settle(c);
      return null;
    }

    case "decline_offer":
    case "cancel_offer": {
      const o = d.offers.find((x) => x.id === action.id);
      const mine = action.type === "decline_offer" ? o?.to === seat : o?.from === seat;
      if (!o || !mine) return "NOT_ALLOWED";
      d.offers = d.offers.filter((x) => x.id !== o.id);
      c.ev.push({
        type: action.type === "decline_offer" ? "offer_declined" : "offer_cancelled",
        id: o.id,
        from: o.from,
        to: o.to,
      });
      return null;
    }

    case "declare_bankruptcy": {
      const debt = d.debts[0];
      if (!debt || debt.from !== seat || d.auction) return "NOT_ALLOWED";
      bankrupt(c, seat, debt.to);
      return null;
    }

    case "auto_pay": {
      const debt = d.debts[0];
      if (!debt || debt.from !== seat || d.auction) return "NOT_ALLOWED";
      if (raiseCash(c, seat, debt.amount)) settle(c);
      else bankrupt(c, seat, debt.to);
      return null;
    }

    case "end_turn":
      if (!onTurn || d.step !== "manage") return "NOT_ALLOWED";
      nextTurn(c);
      return null;

    default:
      return "BAD_ACTION";
  }
}

export const plots: GameDefinition<PlotsState, PlotsAction, PlotsView, PlotsRules> = {
  slug: "plots",
  minPlayers: 2,
  maxPlayers: 8,
  presets: { naija: plotsNaija },
  ruleSchema: plotsRulesSchema,
  actionSchema: plotsActionSchema,

  setup(players, { rules, rng, now }, first = 0) {
    const order = Array.from({ length: players }, (_, i) => (first + i) % players);
    const deck = () => rng.shuffle(Array.from({ length: 16 }, (_, i) => i));
    return {
      players,
      order,
      turn: 0,
      step: "roll",
      again: false,
      doubles: 0,
      dice: null,
      pos: Array(players).fill(0),
      cash: Array(players).fill(rules.startCash),
      owner: Array(SPACES.length).fill(null),
      houses: Array(SPACES.length).fill(0),
      mortgaged: Array(SPACES.length).fill(false),
      bank: { houses: rules.houseSupply, hotels: rules.hotelSupply },
      bail: { gist: null, hustle: null },
      detained: Array(players).fill(null),
      decks: { gist: deck(), hustle: deck() },
      card: null,
      debts: [],
      auction: null,
      auctionQueue: [],
      offers: [],
      nextOfferId: 1,
      jackpot: 0,
      out: [],
      startedAt: now,
      endsAt: null,
      lastRound: false,
      since: now,
      turns: 1,
      ledger: { bankOut: 0, bankIn: 0 },
      places: null,
      proposals: {},
    };
  },

  currentSeats: waitingOn,

  legalActions(s, seat, rules) {
    if (s.places || s.out.includes(seat)) return [];
    const out: PlotsAction[] = [];
    if (s.auction) {
      if (!auctionBidders(s).includes(seat)) return [];
      const min =
        s.auction.by === null ? rules.minBidIncrement : s.auction.high + rules.minBidIncrement;
      if (min <= (s.cash[seat] ?? 0)) out.push({ type: "bid", amount: min });
      out.push({ type: "pass_bid" });
      return out;
    }
    for (const o of s.offers) {
      if (o.to === seat && !s.debts.length)
        out.push({ type: "accept_offer", id: o.id }, { type: "decline_offer", id: o.id });
      if (o.from === seat) out.push({ type: "cancel_offer", id: o.id });
    }
    const raising = s.debts[0]?.from === seat;
    if (raising) out.push({ type: "declare_bankruptcy" }, { type: "auto_pay" });
    if (canManage(s, seat, raising)) {
      for (let i = 0; i < SPACES.length; i++) {
        if (s.owner[i] !== seat) continue;
        if (!raising && !whyNotBuild(s, i, seat, rules)) out.push({ type: "build", space: i });
        if (!whyNotSell(s, i, seat, rules)) out.push({ type: "sell_building", space: i });
        if (!whyNotMortgage(s, i, seat)) out.push({ type: "mortgage", space: i });
        if (!raising && !whyNotUnmortgage(s, i, seat, rules))
          out.push({ type: "unmortgage", space: i });
      }
    }
    if (turnSeat(s) === seat && !s.debts.length) {
      if (s.step === "roll") {
        out.push({ type: "roll" });
        if (s.detained[seat] !== null) {
          if ((s.cash[seat] ?? 0) >= rules.policeFine) out.push({ type: "pay_fine" });
          if (bailCount(s, seat)) out.push({ type: "use_bail" });
        }
      }
      if (s.step === "buy") {
        if ((s.cash[seat] ?? 0) >= priceOf(s.pos[seat] ?? 0)) out.push({ type: "buy" });
        out.push({ type: "decline" });
      }
      if (s.step === "manage") out.push({ type: "end_turn" });
    }
    return out;
  },

  apply(s, { seat, action }, { rules, rng, now }) {
    if (s.places) return err("GAME_OVER");
    if (seat < 0 || seat >= s.players || s.out.includes(seat)) return err("BAD_ACTION");
    const d = draft(s);
    const events: GameEvent[] = [];
    const c: C = { d, rules, rng, now, ev: events };
    // Offers past their time are gone.
    d.offers = d.offers.filter((o) => o.expiresAt > now);
    const before = waitingOn(s).join();
    const wasWaited = waitingOn(s).includes(seat);
    const e = apply(c, seat, action);
    if (e) return err(e);
    checkClock(c);
    // A fresh action clock for whoever must act now, when that changed or they just acted.
    if (wasWaited || waitingOn(d).join() !== before) d.since = now;
    return ok(d, events);
  },

  turnDeadline(s, seat, rules) {
    if (s.places) return null;
    if (s.auction) return auctionBidders(s).includes(seat) ? s.auction.endsAt : null;
    return waitingOn(s).includes(seat) ? s.since + rules.turnSeconds * 1000 + ANIM_MS : null;
  },

  timeoutAction(s, seat) {
    if (s.auction) return { type: "pass_bid" };
    if (s.debts[0]?.from === seat) return { type: "auto_pay" };
    if (s.step === "roll") return { type: "roll" };
    if (s.step === "buy") return { type: "decline" };
    return { type: "end_turn" };
  },

  // Sitting out an auction is a normal way to pass, not being away.
  timeoutCounts: (s) => !s.auction,

  autoAdvance: () => null,

  // A bot's whole turn (roll, buy, build, end) is one write; phones play it back at human pace.
  chainTurns: true,

  // Offers made to a bot that isn't the one being waited on: answered straight away.
  botReply(s, seat, rules) {
    const o = s.offers.find((x) => x.to === seat);
    if (!o || s.auction || s.debts.length || s.places) return null;
    return wantsOffer(s, o, seat, "medium", rules)
      ? { type: "accept_offer", id: o.id }
      : { type: "decline_offer", id: o.id };
  },

  botThinkMs(_s, action) {
    if (action?.type === "bid" || action?.type === "pass_bid") return [500, 1400];
    if (action?.type === "end_turn") return [300, 600];
    return [600, 1100];
  },

  view(s, viewer): PlotsView {
    const { decks, offers, ...rest } = s;
    const you = viewer === "spectator" ? null : viewer;
    return {
      ...rest,
      decksLeft: { gist: decks.gist.length, hustle: decks.hustle.length },
      offers: offers.map((o) =>
        o.from === you || o.to === you
          ? o
          : { id: o.id, from: o.from, to: o.to, expiresAt: o.expiresAt, hidden: true as const },
      ),
      you,
    };
  },

  isOver: (s) => s.places !== null,
  ranking: (s) => s.places ?? [],

  bots: {
    easy: (s, seat, rules, rng) => botAction(s, seat, rules, "easy", rng),
    medium: (s, seat, rules, rng) => botAction(s, seat, rules, "medium", rng),
    hard: (s, seat, rules, rng) => botAction(s, seat, rules, "hard", rng),
  },
};

export { plotsNaija, type PlotsRules } from "./rules";
export { plotsRulesSchema } from "./schemas";
export type { PlotsAction, PlotsState, PlotsView } from "./state";
