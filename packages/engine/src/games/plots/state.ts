import type { SeatIndex } from "../../types";
import type { Deck } from "./board";

/** Money owed that the debtor couldn't pay at once: they raise cash (sell, mortgage) or go bankrupt. */
export type Debt = {
  from: SeatIndex;
  to: SeatIndex | "bank";
  amount: number;
  /** A tax or card fine (goes to Owambe under the jackpot house rule). */
  fine?: boolean;
};

export type Auction = {
  space: number;
  high: number;
  by: SeatIndex | null;
  /** Server time it closes; every bid pushes it back. */
  endsAt: number;
  /** Seats that passed (or can't afford to bid). */
  out: SeatIndex[];
};

export type Bundle = { cash: number; plots: number[]; bail: number };
export type Offer = {
  id: number;
  from: SeatIndex;
  to: SeatIndex;
  give: Bundle;
  get: Bundle;
  expiresAt: number;
};

export type PlotsState = {
  players: number;
  /** Turn order (seats), starting with the room's first player. */
  order: SeatIndex[];
  /** Index into `order`. */
  turn: number;
  /** What the player on turn must do next: roll, decide on a plot they landed on, or manage and end. */
  step: "roll" | "buy" | "manage";
  /** They rolled doubles: another roll after this one is dealt with. */
  again: boolean;
  doubles: number;
  dice: [number, number] | null;
  pos: number[];
  cash: number[];
  /** Per space: owner seat, or null (bank / not ownable). */
  owner: Array<SeatIndex | null>;
  /** Per space: 0–4 houses, 5 = hotel. */
  houses: number[];
  mortgaged: boolean[];
  bank: { houses: number; hotels: number };
  /** Who holds each deck's Bail card (null: it's in the deck). */
  bail: Record<Deck, SeatIndex | null>;
  /** Per seat: null if free, else failed attempts to leave the Police Post so far. */
  detained: Array<number | null>;
  /** Card order, drawn from the front. HIDDEN: never in a view. */
  decks: Record<Deck, number[]>;
  /** The last card drawn (shown until the next action). */
  card: { deck: Deck; id: number; seat: SeatIndex } | null;
  debts: Debt[];
  auction: Auction | null;
  /** Plots waiting for an auction (from a bankruptcy to the bank). */
  auctionQueue: number[];
  offers: Offer[];
  nextOfferId: number;
  /** Owambe house rule. */
  jackpot: number;
  /** Bankrupt seats, in the order they went out. */
  out: SeatIndex[];
  startedAt: number;
  /** Server time the game ends (timed) or hits its cap (classic); set at the first roll. */
  endsAt: number | null;
  lastRound: boolean;
  /** Server time the player who must act now started waiting (their action deadline). */
  since: number;
  /** Turns played so far. */
  turns: number;
  /** Money in and out of the bank, for the conservation invariant. */
  ledger: { bankOut: number; bankIn: number };
  /** Final places (inner arrays are ties); null while playing. */
  places: SeatIndex[][] | null;
  /** Hard bots: the turn of their last trade proposal to each seat ("from>to"). */
  proposals: Record<string, number>;
};

export type PlotsAction =
  | { type: "roll" }
  | { type: "pay_fine" }
  | { type: "use_bail" }
  | { type: "buy" }
  | { type: "decline" }
  | { type: "bid"; amount: number }
  | { type: "pass_bid" }
  | { type: "build"; space: number }
  | { type: "sell_building"; space: number }
  | { type: "mortgage"; space: number }
  | { type: "unmortgage"; space: number }
  | { type: "offer"; to: SeatIndex; give: Bundle; get: Bundle }
  | { type: "accept_offer"; id: number }
  | { type: "decline_offer"; id: number }
  | { type: "cancel_offer"; id: number }
  | { type: "declare_bankruptcy" }
  | { type: "end_turn" }
  /** "Raise it for me" (also timeouts and bots): sell and mortgage to pay what you owe, else go bankrupt. */
  | { type: "auto_pay" };

export type PlotsView = Omit<PlotsState, "decks" | "offers"> & {
  decksLeft: Record<Deck, number>;
  /** Offers you sent or received in full; others' only as "who with whom". */
  offers: Array<
    Offer | { id: number; from: SeatIndex; to: SeatIndex; expiresAt: number; hidden: true }
  >;
  you: SeatIndex | null;
};
