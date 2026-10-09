// Gist and Hustle cards: our own text (docs/games/property.md). Money in ₦1,000 units.
import type { Deck } from "./board";

export type CardEffect =
  | { k: "collect"; amount: number }
  | { k: "pay"; amount: number }
  /** Go forward to a space; salary if you pass Payday. */
  | { k: "advance"; to: number }
  | { k: "back"; n: number }
  /** Nearest transport (owner paid double) or utility (owner paid 15k × a fresh roll). */
  | { k: "nearest"; kind: "transport" | "utility" }
  | { k: "repairs"; house: number; hotel: number }
  | { k: "police" }
  | { k: "bail" }
  | { k: "pay_each"; amount: number }
  | { k: "collect_each"; amount: number };

export type Card = { text: string; effect: CardEffect };

export const CARDS: Record<Deck, readonly Card[]> = {
  gist: [
    {
      text: "Your cousin's wedding: you're the MC. Collect ₦100k in sprayed money.",
      effect: { k: "collect", amount: 100 },
    },
    { text: "Traffic on the bridge. Move back 3 spaces.", effect: { k: "back", n: 3 } },
    { text: "Advance to Payday. Collect your salary.", effect: { k: "advance", to: 0 } },
    { text: "Your phone screen cracked again. Pay ₦40k.", effect: { k: "pay", amount: 40 } },
    {
      text: "Advance to the nearest transport space. If someone owns it, pay them double the rent. If nobody does, you may buy it.",
      effect: { k: "nearest", kind: "transport" },
    },
    {
      text: "You booked a cheap flight. Advance to the Airport. Collect salary if you pass Payday.",
      effect: { k: "advance", to: 34 },
    },
    {
      text: "Generator spoilt again. Repairs: pay ₦25k per house and ₦100k per hotel you own.",
      effect: { k: "repairs", house: 25, hotel: 100 },
    },
    {
      text: "Your song is playing at every party. Collect ₦150k.",
      effect: { k: "collect", amount: 150 },
    },
    {
      text: "Checkpoint! Go straight to the Police Post. Don't pass Payday, no salary.",
      effect: { k: "police" },
    },
    {
      text: "Bail card. Leave the Police Post free. Keep it until you need it, or trade it.",
      effect: { k: "bail" },
    },
    {
      text: "Business meeting in Abuja. Advance to Wuse II. Collect salary if you pass Payday.",
      effect: { k: "advance", to: 35 },
    },
    {
      text: "Tech job interview. Advance to Yaba. Collect salary if you pass Payday.",
      effect: { k: "advance", to: 11 },
    },
    {
      text: "You've been made chairman of your estate. Pay each player ₦50k for the meeting refreshments.",
      effect: { k: "pay_each", amount: 50 },
    },
    { text: "Your side hustle finally paid. Collect ₦80k.", effect: { k: "collect", amount: 80 } },
    {
      text: "Advance to the nearest utility. If someone owns it, roll the dice and pay them ₦15k × the roll.",
      effect: { k: "nearest", kind: "utility" },
    },
    {
      text: "Light went off in the middle of the match. Pay ₦20k for fuel.",
      effect: { k: "pay", amount: 20 },
    },
  ],
  hustle: [
    { text: "Salary came early. Advance to Payday.", effect: { k: "advance", to: 0 } },
    {
      text: "School fees for your younger sibling. Pay ₦100k.",
      effect: { k: "pay", amount: 100 },
    },
    {
      text: "Your POS stand had a great week. Collect ₦120k.",
      effect: { k: "collect", amount: 120 },
    },
    {
      text: "Owambe season! Every player buys your aso-ebi. Collect ₦30k from each player.",
      effect: { k: "collect_each", amount: 30 },
    },
    { text: "Hospital bill. Pay ₦60k.", effect: { k: "pay", amount: 60 } },
    {
      text: "Bail card. Leave the Police Post free. Keep it until you need it, or trade it.",
      effect: { k: "bail" },
    },
    {
      text: "You overpaid your electricity bill. Refund: collect ₦50k.",
      effect: { k: "collect", amount: 50 },
    },
    { text: "Agent fee for your new flat. Pay ₦90k.", effect: { k: "pay", amount: 90 } },
    {
      text: "Second place in the area football tournament. Collect ₦60k.",
      effect: { k: "collect", amount: 60 },
    },
    {
      text: "Wrong turn into a one-way street. Go straight to the Police Post. Don't pass Payday, no salary.",
      effect: { k: "police" },
    },
    {
      text: "Your uncle in the village left you something. Collect ₦200k.",
      effect: { k: "collect", amount: 200 },
    },
    { text: "Your skit went viral. Collect ₦100k.", effect: { k: "collect", amount: 100 } },
    {
      text: "Estate dues: pay ₦30k per house and ₦120k per hotel you own.",
      effect: { k: "repairs", house: 30, hotel: 120 },
    },
    {
      text: "It's your birthday. Collect ₦20k from each player.",
      effect: { k: "collect_each", amount: 20 },
    },
    { text: "Bank charges, again. Pay ₦15k.", effect: { k: "pay", amount: 15 } },
    { text: "You sold your old phone. Collect ₦45k.", effect: { k: "collect", amount: 45 } },
  ],
};

/** The one Bail card in each deck. */
export const BAIL_CARD: Record<Deck, number> = { gist: 9, hustle: 5 };
