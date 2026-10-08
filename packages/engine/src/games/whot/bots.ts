import { at } from "../../at";
import type { BotLevel, Rng, SeatIndex } from "../../types";
import { parseCard, SHAPES, type Shape } from "./cards";
import { deckCards, nextSeat, whyNotPlayable } from "./core";
import type { WhotRules } from "./rules";
import type { WhotAction, WhotState } from "./state";

// Bots see only what a player at the table could: their own hand, the pile, counts and
// public history (who went to market when a shape was wanted). Never other hands.

type Ctx = {
  s: WhotState;
  seat: SeatIndex;
  rules: WhotRules;
  rng: Rng;
  hand: string[];
  playable: string[];
};

function context(s: WhotState, seat: SeatIndex, rules: WhotRules, rng: Rng): Ctx {
  const hand = s.hands[seat] ?? [];
  const ctx = {
    top: s.pile[s.pile.length - 1] ?? "",
    callShape: s.callShape,
    pendingPick: s.pendingPick,
    handSize: hand.length,
  };
  const playable =
    s.turn !== seat
      ? []
      : s.deck
        ? deckCards(hand, s.deck, rules)
        : hand.filter((c) => whyNotPlayable(c, ctx, rules) === null);
  return { s, seat, rules, rng, hand, playable };
}

/** Bots declare before the play that takes them to one card (and when they're on one). */
function shouldDeclare(c: Ctx, chance: number): boolean {
  const { s, seat, rules, hand } = c;
  if (!rules.mustDeclareLastCard || s.lastCardDeclared[seat]) return false;
  const aboutToBeLast = hand.length === 2 && s.turn === seat && c.playable.length > 0;
  return (hand.length === 1 || aboutToBeLast) && c.rng.int(100) < chance;
}

function mostHeldShape(hand: string[], rng: Rng, exclude?: string): Shape {
  const counts = new Map<Shape, number>();
  for (const id of hand) {
    if (id === exclude) continue;
    const { shape } = parseCard(id);
    if (shape !== "whot") counts.set(shape, (counts.get(shape) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return best ?? at(SHAPES, rng.int(SHAPES.length));
}

function play(c: Ctx, card: string, requestShape?: Shape): WhotAction {
  const checkUp = c.rules.checkUpRequired && c.hand.length === 1 ? { checkUp: true } : {};
  if (parseCard(card).shape === "whot") {
    return {
      type: "play",
      card,
      requestShape: requestShape ?? mostHeldShape(c.hand, c.rng, card),
      ...checkUp,
    };
  }
  return { type: "play", card, ...checkUp };
}

/**
 * In an open deck: keep shedding. Hard picks the card that leaves the most ways to go on;
 * a Whot is kept back (it ends the deck) unless it's the last card or nothing else fits.
 */
function continueDeck(c: Ctx, smart: boolean): WhotAction {
  const { s, rules } = c;
  const deck = s.deck;
  if (!deck || !c.playable.length) return { type: "done" };
  const nonWhot = c.playable.filter((x) => parseCard(x).shape !== "whot");
  if (!nonWhot.length) return c.hand.length === 1 ? play(c, at(c.playable, 0)) : { type: "done" };
  if (!smart) return play(c, at(nonWhot, 0));
  const options = (card: string) => {
    const rest = c.hand.filter((x) => x !== card);
    const kind = deck.kind ?? (parseCard(card).n === parseCard(deck.first).n ? "number" : "shape");
    return deckCards(rest, { ...deck, kind, last: card }, rules).length;
  };
  const best = [...nonWhot].sort((a, b) => options(b) - options(a))[0] ?? at(nonWhot, 0);
  return play(c, best);
}

export function easy(s: WhotState, seat: SeatIndex, rules: WhotRules, rng: Rng): WhotAction {
  const c = context(s, seat, rules, rng);
  if (shouldDeclare(c, 70)) return { type: "declare_last_card" };
  if (s.deck) {
    if (!c.playable.length || rng.int(3) === 0) return { type: "done" };
    return play(c, at(c.playable, rng.int(c.playable.length)), at(SHAPES, rng.int(SHAPES.length)));
  }
  if (!c.playable.length) return { type: "market" };
  return play(c, at(c.playable, rng.int(c.playable.length)), at(SHAPES, rng.int(SHAPES.length)));
}

const HURTS = new Set([2, 5, 8, 14]);

function choose(c: Ctx, lackingShape: Shape | null, generalMarketTiming: boolean): WhotAction {
  if (shouldDeclare(c, 100)) return { type: "declare_last_card" };
  if (c.s.deck) return continueDeck(c, generalMarketTiming);
  if (!c.playable.length) return { type: "market" };
  const { s, seat, rules, rng } = c;

  // Under a penalty, the playable cards are exactly the defences.
  if (s.pendingPick) return play(c, at(c.playable, 0));

  const nonWhot = c.playable.filter((x) => parseCard(x).shape !== "whot");
  const next = nextSeat(seat, s.players, s.finished);
  const nextCount = (s.hands[next] ?? []).length;
  const opponentsLow = s.hands.some(
    (h, i) => i !== seat && !s.finished.includes(i) && h.length <= 2,
  );

  if (generalMarketTiming && opponentsLow) {
    const gm = nonWhot.find((x) => parseCard(x).n === 14 && rules.generalMarket);
    if (gm) return play(c, gm);
  }
  if (nextCount <= 3) {
    const hurt = nonWhot.find((x) => HURTS.has(parseCard(x).n));
    if (hurt) return play(c, hurt);
  }
  if (nonWhot.length) {
    // Shed the heaviest card first (fewer points if the market runs out).
    const heaviest =
      [...nonWhot].sort((a, b) => parseCard(b).n - parseCard(a).n)[0] ?? at(nonWhot, 0);
    return play(c, heaviest);
  }
  // Only a Whot left to play: call what the next player seems to lack, else what we hold most.
  const whotCard = at(c.playable, 0);
  return play(c, whotCard, lackingShape ?? mostHeldShape(c.hand, rng, whotCard));
}

export function medium(s: WhotState, seat: SeatIndex, rules: WhotRules, rng: Rng): WhotAction {
  return choose(context(s, seat, rules, rng), null, false);
}

/** Medium, plus memory of who went to market on which shape, and General market timing. */
export function hard(s: WhotState, seat: SeatIndex, rules: WhotRules, rng: Rng): WhotAction {
  const next = nextSeat(seat, s.players, s.finished);
  const lacking = [...s.misses].reverse().find((m) => m.seat === next)?.shape ?? null;
  return choose(context(s, seat, rules, rng), lacking, true);
}

export const whotBots: Record<
  BotLevel,
  (s: WhotState, seat: SeatIndex, rules: WhotRules, rng: Rng) => WhotAction
> = {
  easy,
  medium,
  hard,
};
