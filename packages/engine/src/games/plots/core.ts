// Browser-safe Naija Plots logic (no zod): rents, building and mortgage checks, net worth.
// The full GameDefinition is in ./index.ts. Money in ₦1,000 units.
import type { SeatIndex } from "../../types";
import {
  buildingsCost,
  houseCost,
  sellValue,
  GROUP_SPACES,
  groupOf,
  isOwnable,
  mortgageValue,
  plotRent,
  priceOf,
  SPACES,
  TRANSPORTS,
  transportRent,
  UTILITIES,
  utilityRate,
} from "./board";
import type { PlotsRules } from "./rules";
import type { Bundle, PlotsState } from "./state";

type S = Pick<
  PlotsState,
  "owner" | "houses" | "mortgaged" | "bank" | "cash" | "out" | "bail" | "detained"
>;

export const isActive = (s: Pick<PlotsState, "out">, seat: SeatIndex) => !s.out.includes(seat);
export const activeSeats = (s: Pick<PlotsState, "order" | "out">) =>
  s.order.filter((x) => !s.out.includes(x));
export const turnSeat = (s: Pick<PlotsState, "order" | "turn">) => s.order[s.turn] as SeatIndex;

/**
 * May `seat` build, sell or mortgage now? On your own turn (any step, including while deciding to
 * buy, so you can mortgage to afford a plot), never during an auction; while a debt is being
 * paid, only the debtor, and only to raise cash (sell, mortgage). Decided with Best, Oct 2026.
 */
export function canManageNow(
  s: Pick<PlotsState, "auction" | "debts" | "out" | "places" | "order" | "turn">,
  seat: SeatIndex,
  raising: boolean,
): boolean {
  if (s.places || s.auction || s.out.includes(seat)) return false;
  if (s.debts.length) return raising && s.debts[0]?.from === seat;
  return turnSeat(s) === seat;
}

/** Does `seat` own every plot in this space's group? */
export function ownsGroup(s: Pick<PlotsState, "owner">, space: number, seat: SeatIndex): boolean {
  const g = groupOf(space);
  return !!g && GROUP_SPACES[g].every((i) => s.owner[i] === seat);
}

const groupHasBuildings = (s: Pick<PlotsState, "houses">, space: number) => {
  const g = groupOf(space);
  return !!g && GROUP_SPACES[g].some((i) => (s.houses[i] ?? 0) > 0);
};

/** Rent due on landing here (0 if unowned, mortgaged or your own). `dice`: the roll, for utilities. */
export function rentOf(
  s: Pick<PlotsState, "owner" | "houses" | "mortgaged">,
  space: number,
  dice: number,
  rules: Pick<PlotsRules, "groupRentMultiplier">,
): number {
  const owner = s.owner[space];
  if (owner === null || owner === undefined || s.mortgaged[space]) return 0;
  const sp = SPACES[space];
  if (!sp) return 0;
  if (sp.kind === "plot") {
    const h = s.houses[space] ?? 0;
    if (h > 0) return plotRent(space, h);
    return plotRent(space, 0) * (ownsGroup(s, space, owner) ? rules.groupRentMultiplier : 1);
  }
  if (sp.kind === "transport")
    return transportRent(TRANSPORTS.filter((i) => s.owner[i] === owner).length);
  if (sp.kind === "utility")
    return dice * utilityRate(UTILITIES.filter((i) => s.owner[i] === owner).length);
  return 0;
}

/** Why `seat` can't build a house (or hotel) here now, or null if they can. */
export function whyNotBuild(
  s: S,
  space: number,
  seat: SeatIndex,
  rules: PlotsRules,
): string | null {
  const g = groupOf(space);
  if (!g || s.owner[space] !== seat) return "Not your plot";
  if (!ownsGroup(s, space, seat)) return "You need the whole group first";
  if (GROUP_SPACES[g].some((i) => s.mortgaged[i])) return "Unmortgage the group first";
  const h = s.houses[space] ?? 0;
  if (h >= 5) return "It already has a hotel";
  if (rules.evenBuilding && h > Math.min(...GROUP_SPACES[g].map((i) => s.houses[i] ?? 0)))
    return "Build evenly: the others in the group first";
  if (h === 4 ? s.bank.hotels < 1 : s.bank.houses < 1)
    return h === 4 ? "No hotels left in the bank" : "No houses left in the bank";
  if ((s.cash[seat] ?? 0) < houseCost(space, h + 1)) return "Not enough cash";
  return null;
}

/** Why `seat` can't sell a building here, or null. */
export function whyNotSell(s: S, space: number, seat: SeatIndex, rules: PlotsRules): string | null {
  const g = groupOf(space);
  if (!g || s.owner[space] !== seat) return "Not your plot";
  const h = s.houses[space] ?? 0;
  if (h === 0) return "No buildings here";
  if (rules.evenBuilding && h < Math.max(...GROUP_SPACES[g].map((i) => s.houses[i] ?? 0)))
    return "Sell evenly: the others in the group first";
  return null;
}

/** Why `seat` can't mortgage this space, or null. */
export function whyNotMortgage(s: S, space: number, seat: SeatIndex): string | null {
  if (!isOwnable(space) || s.owner[space] !== seat) return "Not yours";
  if (s.mortgaged[space]) return "Already mortgaged";
  if (groupHasBuildings(s, space)) return "Sell the group's buildings first";
  return null;
}

export const unmortgageCost = (space: number, rules: Pick<PlotsRules, "mortgageInterestPct">) => {
  const mv = mortgageValue(space);
  return mv + Math.ceil((mv * rules.mortgageInterestPct) / 100);
};
export const transferInterest = (space: number, rules: Pick<PlotsRules, "mortgageInterestPct">) =>
  Math.ceil((mortgageValue(space) * rules.mortgageInterestPct) / 100);

export function whyNotUnmortgage(
  s: S,
  space: number,
  seat: SeatIndex,
  rules: PlotsRules,
): string | null {
  if (s.owner[space] !== seat) return "Not yours";
  if (!s.mortgaged[space]) return "Not mortgaged";
  if ((s.cash[seat] ?? 0) < unmortgageCost(space, rules)) return "Not enough cash";
  return null;
}

export { sellValue };

/** Bail cards a seat holds. */
export const bailCount = (s: Pick<PlotsState, "bail">, seat: SeatIndex) =>
  (s.bail.gist === seat ? 1 : 0) + (s.bail.hustle === seat ? 1 : 0);

/**
 * Net worth (docs/games/property.md): cash, unmortgaged plots at price, mortgaged at their
 * mortgage value, houses at build cost, a hotel at 5 × build cost, Bail cards at the fine,
 * less anything owed.
 */
export function netWorth(
  s: S & Pick<PlotsState, "debts">,
  seat: SeatIndex,
  rules: Pick<PlotsRules, "policeFine">,
): number {
  if (s.out.includes(seat)) return 0;
  let w = s.cash[seat] ?? 0;
  for (let i = 0; i < SPACES.length; i++) {
    if (s.owner[i] !== seat) continue;
    w += s.mortgaged[i] ? mortgageValue(i) : priceOf(i);
    const g = groupOf(i);
    if (g) w += buildingsCost(i, s.houses[i] ?? 0);
  }
  w += bailCount(s, seat) * rules.policeFine;
  for (const d of s.debts) if (d.from === seat) w -= d.amount;
  return w;
}

/** Spaces a seat owns, in board order. */
export const plotsOf = (s: Pick<PlotsState, "owner">, seat: SeatIndex) =>
  s.owner.flatMap((o, i) => (o === seat ? [i] : []));

/** Why this bundle can't come from `seat` now, or null. */
export function whyNotBundle(s: S, seat: SeatIndex, b: Bundle): string | null {
  if (!Number.isInteger(b.cash) || b.cash < 0) return "Bad cash amount";
  if (b.cash > (s.cash[seat] ?? 0)) return "Not enough cash";
  if (new Set(b.plots).size !== b.plots.length) return "A plot is listed twice";
  for (const p of b.plots) {
    if (s.owner[p] !== seat) return "A plot changed hands";
    if (groupHasBuildings(s, p)) return "Sell the buildings in that group first";
  }
  if (b.bail < 0 || b.bail > bailCount(s, seat)) return "Not enough Bail cards";
  return null;
}

export const emptyBundle = (b: Bundle) => b.cash === 0 && b.plots.length === 0 && b.bail === 0;

/** Cash a seat could raise right now: every building sold, every free plot mortgaged. */
export function raisable(s: Pick<PlotsState, "owner" | "houses" | "mortgaged">, seat: SeatIndex) {
  let total = 0;
  for (let i = 0; i < SPACES.length; i++) {
    if (s.owner[i] !== seat) continue;
    for (let level = 1; level <= (s.houses[i] ?? 0); level++) total += sellValue(i, level);
    if (!s.mortgaged[i]) total += mortgageValue(i);
  }
  return total;
}
