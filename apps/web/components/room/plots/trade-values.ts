// What each side of a Naija Plots offer is worth, and a warning when it's one-sided
// (Best, Oct 2026: offers like "give me your plot and pay me too" caught people out).
import { mortgageValue, naira, priceOf, type Bundle, type PlotsView } from "@gamehub/engine/plots";

/** Cash, plus each plot at its price (half if mortgaged), plus Bail cards at the police fine. */
export function bundleValue(view: Pick<PlotsView, "mortgaged">, b: Bundle, bailValue: number) {
  return (
    b.cash +
    b.plots.reduce((n, p) => n + (view.mortgaged[p] ? mortgageValue(p) : priceOf(p)), 0) +
    b.bail * bailValue
  );
}

export const isEmpty = (b: Bundle) => !b.cash && !b.plots.length && !b.bail;

/**
 * A warning for `me`, who gives `give` and gets `get`: nothing back, or much less (under half the
 * value). Null when it looks fair enough; still allowed either way.
 */
export function tradeWarning(
  view: Pick<PlotsView, "mortgaged">,
  give: Bundle,
  get: Bundle,
  bailValue: number,
): string | null {
  if (isEmpty(give) && isEmpty(get)) return null;
  const out = bundleValue(view, give, bailValue);
  const back = bundleValue(view, get, bailValue);
  if (isEmpty(get)) return `You give ${naira(out)} worth and get nothing back`;
  if (isEmpty(give)) return null; // they give you something for nothing: nothing to warn you about
  if (back * 2 < out) return `You give ${naira(out)} worth for ${naira(back)}: under half back`;
  return null;
}

/** Clamp a typed amount (in ₦1,000 units) to 0…max. */
export const clampCash = (typed: string, max: number) => {
  const n = Math.floor(Number(typed.replace(/\D/g, "")) || 0);
  return Math.max(0, Math.min(max, n));
};
