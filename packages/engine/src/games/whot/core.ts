// Browser-safe Whot logic (no zod). The full GameDefinition is in ./index.ts.
import type { SeatIndex } from "../../types";
import { DECK, isSpecialNumber, parseCard, type Shape } from "./cards";
import type { DeckMode, WhotRules } from "./rules";
import type { Deck, PendingPick } from "./state";

export type PlayContext = {
  top: string;
  callShape: Shape | null;
  pendingPick: PendingPick | null;
  /** Cards in the player's hand before this play. */
  handSize: number;
};

/** Does this card have its special effect under these rules? */
export function isActiveSpecial(card: string, rules: WhotRules): boolean {
  const { n } = parseCard(card);
  return (
    (n === 1 && rules.holdOn) ||
    (n === 2 && rules.pickTwo) ||
    (n === 5 && rules.pickThree) ||
    (n === 8 && rules.suspension) ||
    (n === 14 && rules.generalMarket) ||
    n === 20
  );
}

/** Why a card can't be played right now, or null if it can. */
export function whyNotPlayable(card: string, ctx: PlayContext, rules: WhotRules): string | null {
  const c = parseCard(card);
  const top = parseCard(ctx.top);
  if (ctx.handSize === 1 && !rules.canFinishOnSpecial && isSpecialNumber(c.n)) {
    return "You can't finish on a special card";
  }
  if (ctx.pendingPick) {
    if (!rules.stackPenalties) return `Pick ${ctx.pendingPick.amount}`;
    const defends = c.n === ctx.pendingPick.kind || (rules.crossStack && (c.n === 2 || c.n === 5));
    if (!defends || c.shape === "whot") return `Pick ${ctx.pendingPick.amount} or defend`;
    return null;
  }
  if (c.shape === "whot") return null;
  if (ctx.callShape) return c.shape === ctx.callShape ? null : `Play a ${ctx.callShape}`;
  if (top.shape === "whot") return null; // first call card was a Whot: anything goes
  if (c.shape === top.shape || c.n === top.n) return null;
  return "Doesn't match";
}

/** The room's decking rule ("off" for rules saved before it existed). */
export const deckMode = (rules: WhotRules): DeckMode => rules.decking ?? "off";

/** Why a card can't continue this deck, or null if it can. */
export function whyNotDeckable(
  card: string,
  deck: Deck,
  rules: WhotRules,
  handSize: number,
): string | null {
  const c = parseCard(card);
  if (handSize === 1 && !rules.canFinishOnSpecial && isSpecialNumber(c.n)) {
    return "You can't finish on a special card";
  }
  if (c.shape === "whot") return null; // a Whot can always end a deck
  const first = parseCard(deck.first);
  const last = parseCard(deck.last);
  const ok =
    deck.kind === "number"
      ? c.n === first.n
      : deck.kind === "shape"
        ? c.shape === first.shape
        : deck.kind === "chain"
          ? c.n === last.n || c.shape === last.shape
          : c.n === first.n || c.shape === first.shape;
  return ok ? null : deck.kind === "shape" ? `Deck a ${first.shape}` : "Doesn't continue the deck";
}

/** Cards in the hand that can continue the deck. */
export const deckCards = (hand: readonly string[], deck: Deck, rules: WhotRules) =>
  hand.filter((card) => whyNotDeckable(card, deck, rules, hand.length) === null);

export function playableCards(
  hand: readonly string[],
  ctx: Omit<PlayContext, "handSize">,
  rules: WhotRules,
) {
  return hand.filter(
    (card) => whyNotPlayable(card, { ...ctx, handSize: hand.length }, rules) === null,
  );
}

/** Keep at least this many cards in the market after dealing. */
const MIN_MARKET = 10;

/** Cards each player actually gets: big tables get fewer so the market isn't empty. */
export const dealSize = (players: number, handSize: number) =>
  Math.max(1, Math.min(handSize, Math.floor((DECK.length - 1 - MIN_MARKET) / players)));

/** "Last card" can be said with one card, or with two on your own turn (just before playing). */
export const canDeclareLastCard = (handSize: number, myTurn: boolean, declared: boolean) =>
  !declared && (handSize === 1 || (handSize === 2 && myTurn));

/** Next seat that's still playing, `steps` places on. */
export function nextSeat(
  from: SeatIndex,
  players: number,
  finished: readonly SeatIndex[],
  steps = 1,
): SeatIndex {
  let seat = from;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < players; i++) {
      seat = (seat + 1) % players;
      if (!finished.includes(seat)) break;
    }
  }
  return seat;
}

export {
  cardValue,
  DECK,
  handTotal,
  parseCard,
  SHAPES,
  type Card,
  type CardShape,
  type Shape,
} from "./cards";
export { whotNaija, type DeckMode, type WhotRules } from "./rules";
export type { Deck, PendingPick, WhotAction, WhotState, WhotView } from "./state";
