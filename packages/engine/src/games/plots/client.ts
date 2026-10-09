// Browser-safe entry for Naija Plots (no zod): board, cards, rules, checks, net worth.
export * from "./board";
export * from "./cards";
export * from "./core";
export { plotsNaija, type PlotsRules } from "./rules";
export type { Auction, Bundle, Debt, Offer, PlotsAction, PlotsState, PlotsView } from "./state";
