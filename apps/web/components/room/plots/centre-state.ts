// What the Naija Plots table offers a player right now, as plain data, so a test can check it
// against the engine (every button it shows is one the game accepts, and nobody is left stuck).
import {
  bailCount,
  canManageNow,
  priceOf,
  raisable,
  whyNotBuild,
  whyNotMortgage,
  whyNotSell,
  whyNotUnmortgage,
  type PlotsAction,
  type PlotsRules,
  type PlotsView,
} from "@gamehub/engine/plots";

export type CentreState =
  | { kind: "over" }
  | {
      kind: "auction";
      space: number;
      /** Still in it (not passed, not the high bidder). */
      bidding: boolean;
      /** Quick bids you can afford: [label step, amount]. */
      quick: Array<{ step: number; amount: number }>;
      min: number;
    }
  | { kind: "owe"; amount: number; to: number | "bank"; cash: number; raisable: number }
  | { kind: "raising"; seat: number; amount: number }
  | { kind: "roll"; detained: boolean; again: boolean; canPay: boolean; canBail: boolean }
  | { kind: "buy"; space: number; price: number; canBuy: boolean }
  | { kind: "manage" }
  | { kind: "turn"; seat: number };

const QUICK_STEPS = [0, 50, 100];

/** The centre panel's state for `me` (null: watching). */
export function centreState(view: PlotsView, rules: PlotsRules, me: number | null): CentreState {
  if (view.places) return { kind: "over" };
  const turnSeat = view.order[view.turn] as number;
  const a = view.auction;
  if (a) {
    const inc = rules.minBidIncrement;
    const min = a.by === null ? inc : a.high + inc;
    const cash = me === null ? 0 : (view.cash[me] ?? 0);
    const bidding = me !== null && !view.out.includes(me) && !a.out.includes(me) && a.by !== me;
    const quick = QUICK_STEPS.map((step, k) => {
      const s = k === 0 ? inc : step;
      return { step: s, amount: a.by === null ? Math.max(inc, s) : a.high + s };
    }).filter((q) => q.amount <= cash);
    return { kind: "auction", space: a.space, bidding, quick: bidding ? quick : [], min };
  }
  const debt = view.debts[0];
  if (debt) {
    if (debt.from === me)
      return {
        kind: "owe",
        amount: debt.amount,
        to: debt.to,
        cash: view.cash[me] ?? 0,
        raisable: raisable(view, me),
      };
    return { kind: "raising", seat: debt.from, amount: debt.amount };
  }
  if (me === null || turnSeat !== me) return { kind: "turn", seat: turnSeat };
  if (view.step === "roll") {
    const detained = view.detained[me] !== null && view.detained[me] !== undefined;
    return {
      kind: "roll",
      detained,
      again: view.again,
      canPay: detained && (view.cash[me] ?? 0) >= rules.policeFine,
      canBail: detained && bailCount(view, me) > 0,
    };
  }
  if (view.step === "buy") {
    const space = view.pos[me] ?? 0;
    const price = priceOf(space);
    return { kind: "buy", space, price, canBuy: (view.cash[me] ?? 0) >= price };
  }
  return { kind: "manage" };
}

/** The actions behind the centre panel's enabled buttons. */
export function centreActions(c: CentreState): PlotsAction[] {
  switch (c.kind) {
    case "auction":
      return c.bidding
        ? [
            ...c.quick.map((q) => ({ type: "bid" as const, amount: q.amount })),
            { type: "pass_bid" },
          ]
        : [];
    case "owe":
      return [{ type: "auto_pay" }, { type: "declare_bankruptcy" }];
    case "roll":
      return [
        { type: "roll" },
        ...(c.canPay ? [{ type: "pay_fine" as const }] : []),
        ...(c.canBail ? [{ type: "use_bail" as const }] : []),
      ];
    case "buy":
      return [...(c.canBuy ? [{ type: "buy" as const }] : []), { type: "decline" }];
    case "manage":
      return [{ type: "end_turn" }];
    default:
      return [];
  }
}

export type PlotChoices = {
  build: string | null;
  sell: string | null;
  mortgage: string | null;
  unmortgage: string | null;
};

/** For a plot you own: why each action can't be done now (null: it can). */
export function plotChoices(
  view: PlotsView,
  rules: PlotsRules,
  me: number | null,
  space: number,
): PlotChoices {
  const not = "Not during an auction or someone's payment";
  if (me === null || view.owner[space] !== me)
    return {
      build: "Not yours",
      sell: "Not yours",
      mortgage: "Not yours",
      unmortgage: "Not yours",
    };
  const manage = canManageNow(view, me, false);
  const raise = canManageNow(view, me, true);
  const owing = view.debts[0]?.from === me;
  return {
    build: !manage ? (owing ? "Pay what you owe first" : not) : whyNotBuild(view, space, me, rules),
    sell: !raise ? not : whyNotSell(view, space, me, rules),
    mortgage: !raise ? not : whyNotMortgage(view, space, me),
    unmortgage: !manage
      ? owing
        ? "Pay what you owe first"
        : not
      : whyNotUnmortgage(view, space, me, rules),
  };
}
