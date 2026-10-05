import { err, ok } from "../../result";
import type { GameDefinition, GameEvent, Rng, SeatIndex } from "../../types";
import { whotBots } from "./bots";
import { DECK, handTotal, parseCard, SHAPES } from "./cards";
import { canDeclareLastCard, dealSize, isActiveSpecial, nextSeat, whyNotPlayable } from "./core";
import { whotNaija, type WhotRules } from "./rules";
import { whotActionSchema, whotRulesSchema } from "./schemas";
import type { WhotAction, WhotState, WhotView } from "./state";

/** After this many reshuffles the next empty market ends the game by count. */
export const MAX_RESHUFFLES = 3;

/** Working copy: apply() mutates this, never the input state. */
function draft(s: WhotState): WhotState {
  return {
    ...s,
    hands: s.hands.map((h) => [...h]),
    market: [...s.market],
    pile: [...s.pile],
    lastCardDeclared: [...s.lastCardDeclared],
    finished: [...s.finished],
    misses: [...s.misses],
  };
}

/** Groups seats by hand total, lowest first (ties share a place). */
function rankByTotals(d: WhotState, seats: SeatIndex[]): SeatIndex[][] {
  const byTotal = new Map<number, SeatIndex[]>();
  for (const seat of seats) {
    const t = handTotal(d.hands[seat] ?? []);
    byTotal.set(t, [...(byTotal.get(t) ?? []), seat]);
  }
  return [...byTotal.entries()].sort((a, b) => a[0] - b[0]).map(([, group]) => group);
}

const stillIn = (d: WhotState) =>
  Array.from({ length: d.players }, (_, i) => i).filter((i) => !d.finished.includes(i));

function endByCount(d: WhotState, events: GameEvent[]) {
  d.over = true;
  d.places = [...d.finished.map((seat) => [seat]), ...rankByTotals(d, stillIn(d))];
  events.push({ type: "market_empty" });
}

/** Draws n cards for a seat. Returns false if the game ended because the market ran out. */
function drawInto(
  d: WhotState,
  seat: SeatIndex,
  n: number,
  rules: WhotRules,
  rng: Rng,
  events: GameEvent[],
): boolean {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (d.market.length === 0) {
      if (
        rules.marketExhausted === "reshuffle" &&
        d.pile.length > 1 &&
        d.reshuffles < MAX_RESHUFFLES
      ) {
        const top = d.pile.pop() as string;
        d.market = rng.shuffle(d.pile);
        d.pile = [top];
        d.reshuffles++;
        events.push({ type: "reshuffled" });
      } else {
        if (drawn) events.push({ type: "went_market", seat, count: drawn });
        endByCount(d, events);
        return false;
      }
    }
    (d.hands[seat] as string[]).push(d.market.pop() as string);
    drawn++;
  }
  if ((d.hands[seat] ?? []).length > 1) d.lastCardDeclared[seat] = false;
  events.push({ type: "went_market", seat, count: drawn });
  return true;
}

function finish(d: WhotState, seat: SeatIndex, rules: WhotRules, events: GameEvent[]) {
  d.finished.push(seat);
  events.push({ type: "finished", seat });
  const left = stillIn(d);
  if (rules.multiWinner === "rankByCount") {
    d.over = true;
    d.places = [[seat], ...rankByTotals(d, left)];
  } else if (left.length <= 1) {
    d.finished.push(...left);
    d.over = true;
    d.places = d.finished.map((x) => [x]);
  }
}

const canDeclare = (s: WhotState, seat: SeatIndex) =>
  canDeclareLastCard((s.hands[seat] ?? []).length, seat === s.turn, !!s.lastCardDeclared[seat]);

export const whot: GameDefinition<WhotState, WhotAction, WhotView, WhotRules> = {
  slug: "whot",
  minPlayers: 2,
  maxPlayers: 8,
  presets: { naija: whotNaija },
  ruleSchema: whotRulesSchema,
  actionSchema: whotActionSchema,

  setup(players, { rng, rules }) {
    const market = rng.shuffle(DECK);
    const size = dealSize(players, rules.handSize);
    const hands = Array.from({ length: players }, () => market.splice(market.length - size, size));
    const top = market.pop() as string;
    const s: WhotState = {
      players,
      hands,
      market,
      pile: [top],
      callShape: null,
      turn: 0,
      pendingPick: null,
      lastCardDeclared: Array<boolean>(players).fill(false),
      lastCardDue: null,
      finished: [],
      over: false,
      places: null,
      misses: [],
      reshuffles: 0,
    };
    // Default: a special first call card does nothing. "apply" gives it its effect on seat 0.
    if (rules.firstCardEffect === "apply" && isActiveSpecial(top, rules)) {
      const { n } = parseCard(top);
      if (n === 2) s.pendingPick = { amount: 2, kind: 2 };
      if (n === 5) s.pendingPick = { amount: 3, kind: 5 };
      if (n === 8) s.turn = 1 % players;
      if (n === 14) for (let i = 0; i < players; i++) drawInto(s, i, 1, rules, rng, []);
    }
    return s;
  },

  currentSeats: (s) => (s.over ? [] : [s.turn]),

  legalActions(s, seat, rules) {
    if (s.over || s.finished.includes(seat)) return [];
    const actions: WhotAction[] = [];
    if (rules.mustDeclareLastCard && canDeclare(s, seat))
      actions.push({ type: "declare_last_card" });
    if (seat !== s.turn) return actions;
    const hand = s.hands[seat] ?? [];
    const ctx = {
      top: s.pile[s.pile.length - 1] ?? "",
      callShape: s.callShape,
      pendingPick: s.pendingPick,
      handSize: hand.length,
    };
    const checkUp = rules.checkUpRequired && hand.length === 1 ? { checkUp: true } : {};
    for (const card of hand) {
      if (whyNotPlayable(card, ctx, rules) !== null) continue;
      if (parseCard(card).shape === "whot") {
        for (const requestShape of SHAPES)
          actions.push({ type: "play", card, requestShape, ...checkUp });
      } else actions.push({ type: "play", card, ...checkUp });
    }
    actions.push({ type: "market" });
    return actions;
  },

  apply(s, { seat, action }, { rules, rng }) {
    if (s.over) return err("GAME_OVER");
    if (seat < 0 || seat >= s.players || s.finished.includes(seat)) return err("BAD_ACTION");
    const d = draft(s);
    const events: GameEvent[] = [];

    if (action.type === "declare_last_card") {
      if (!rules.mustDeclareLastCard || !canDeclare(s, seat)) return err("ILLEGAL_MOVE");
      d.lastCardDeclared[seat] = true;
      if (d.lastCardDue === seat) d.lastCardDue = null;
      events.push({ type: "last_card", seat });
      return ok(d, events);
    }

    if (seat !== s.turn) return err("NOT_YOUR_TURN");

    // Someone hit one card without declaring: this move makes them pay.
    if (d.lastCardDue !== null && d.lastCardDue !== seat) {
      const due = d.lastCardDue;
      d.lastCardDue = null;
      events.push({
        type: "penalty",
        seat: due,
        count: rules.lastCardPenalty,
        reason: "last_card",
      });
      if (!drawInto(d, due, rules.lastCardPenalty, rules, rng, events)) return ok(d, events);
    }

    if (action.type === "market") {
      const pending = d.pendingPick;
      if (pending) {
        d.pendingPick = null;
        events.push({ type: "penalty", seat, count: pending.amount, reason: "pick" });
        if (!drawInto(d, seat, pending.amount, rules, rng, events)) return ok(d, events);
      } else {
        const top = parseCard(d.pile[d.pile.length - 1] ?? "");
        const wanted = d.callShape ?? (top.shape !== "whot" ? top.shape : null);
        if (wanted) d.misses = [...d.misses.slice(-40), { seat, shape: wanted }];
        if (!drawInto(d, seat, 1, rules, rng, events)) return ok(d, events);
      }
      d.turn = nextSeat(seat, d.players, d.finished);
      return ok(d, events);
    }

    // Play a card.
    const hand = d.hands[seat] as string[];
    const at = hand.indexOf(action.card);
    if (at < 0) return err("NO_SUCH_CARD");
    const ctx = {
      top: d.pile[d.pile.length - 1] ?? "",
      callShape: d.callShape,
      pendingPick: d.pendingPick,
      handSize: hand.length,
    };
    const why = whyNotPlayable(action.card, ctx, rules);
    if (why !== null) {
      if (d.pendingPick) return err("MUST_ANSWER_PENALTY");
      if (d.callShape) return err("MUST_PLAY_REQUESTED_SHAPE");
      return err("ILLEGAL_MOVE");
    }
    const card = parseCard(action.card);
    if ((card.shape === "whot") !== !!action.requestShape) return err("BAD_ACTION");
    const checkUpDue = rules.checkUpRequired && hand.length === 1;
    if (checkUpDue && !action.checkUp) return err("ILLEGAL_MOVE");
    if (!checkUpDue && action.checkUp) return err("BAD_ACTION");

    hand.splice(at, 1);
    d.pile.push(action.card);
    d.callShape = null;
    events.push({ type: "played", seat, card: action.card });

    const special = isActiveSpecial(action.card, rules);
    if (hand.length === 0) {
      finish(d, seat, rules, events);
      if (d.over) return ok(d, events);
    } else if (hand.length === 1 && rules.mustDeclareLastCard && !d.lastCardDeclared[seat]) {
      d.lastCardDue = seat;
    }
    const out = hand.length === 0;
    const next = () => nextSeat(seat, d.players, d.finished);

    if (!special) {
      d.turn = next();
    } else if (card.n === 2 || card.n === 5) {
      const add = card.n === 2 ? 2 : 3;
      const amount = (rules.stackPenalties && d.pendingPick ? d.pendingPick.amount : 0) + add;
      d.pendingPick = { amount, kind: card.n };
      events.push({ type: card.n === 2 ? "pick_two" : "pick_three", amount });
      d.turn = next();
    } else if (card.n === 1) {
      events.push({ type: "hold_on" });
      d.turn = out ? next() : seat;
    } else if (card.n === 8) {
      events.push({ type: "suspension", skipped: next() });
      d.turn = nextSeat(seat, d.players, d.finished, 2);
    } else if (card.n === 14) {
      events.push({ type: "general_market" });
      for (const other of stillIn(d)) {
        if (other === seat) continue;
        if (!drawInto(d, other, 1, rules, rng, events)) return ok(d, events);
      }
      d.turn = out ? next() : seat;
    } else {
      // Whot
      d.callShape = action.requestShape ?? null;
      events.push({ type: "whot", shape: d.callShape });
      d.turn = next();
    }
    return ok(d, events);
  },

  timeoutAction: () => ({ type: "market" }),
  autoAdvance: () => null,

  view(s, viewer): WhotView {
    const seat = viewer === "spectator" ? null : viewer;
    return {
      players: s.players,
      you: seat === null ? null : { seat, hand: [...(s.hands[seat] ?? [])] },
      counts: s.hands.map((h) => h.length),
      top: s.pile[s.pile.length - 1] ?? "",
      pileTop: s.pile.slice(-4),
      callShape: s.callShape,
      marketCount: s.market.length,
      turn: s.turn,
      pendingPick: s.pendingPick,
      lastCardDeclared: [...s.lastCardDeclared],
      lastCardDue: s.lastCardDue,
      finished: [...s.finished],
      over: s.over,
      places: s.places,
      totals: s.over ? s.hands.map((h) => handTotal(h)) : null,
    };
  },

  isOver: (s) => s.over,
  ranking: (s) => s.places ?? [],

  bots: {
    easy: (s, seat, rules, rng) => whotBots.easy(s, seat, rules, rng),
    medium: (s, seat, rules, rng) => whotBots.medium(s, seat, rules, rng),
    hard: (s, seat, rules, rng) => whotBots.hard(s, seat, rules, rng),
  },
};

export type { Shape } from "./cards";
export { whotNaija, type WhotRules } from "./rules";
export { whotRulesSchema } from "./schemas";
export type { WhotAction, WhotState, WhotView } from "./state";
