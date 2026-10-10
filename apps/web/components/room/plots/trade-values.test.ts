import { describe, expect, it } from "vitest";
import { bundleValue, clampCash, tradeWarning } from "./trade-values";

const view = { mortgaged: Array.from({ length: 40 }, (_, i) => i === 3) };
const b = (cash: number, plots: number[] = [], bail = 0) => ({ cash, plots, bail });

describe("trade values and warnings", () => {
  it("values plots at their price, mortgaged ones at half, Bail at the fine", () => {
    // Ojo (1) ₦80k; Challenge (3) ₦90k but mortgaged → ₦45k.
    expect(bundleValue(view, b(50, [1, 3], 1), 60)).toBe(50 + 80 + 45 + 60);
  });

  it("warns when you get nothing back, or under half", () => {
    expect(tradeWarning(view, b(0, [1]), b(0), 60)).toBe(
      "You give ₦80k worth and get nothing back",
    );
    // "Give me your plot and pay me": you give a plot and cash, get nothing.
    expect(tradeWarning(view, b(100, [1]), b(0), 60)).toMatch(/get nothing back/);
    expect(tradeWarning(view, b(0, [1]), b(30), 60)).toBe(
      "You give ₦80k worth for ₦30k: under half back",
    );
    expect(tradeWarning(view, b(0, [1]), b(60), 60)).toBeNull();
    expect(tradeWarning(view, b(0), b(60), 60)).toBeNull(); // a gift to you
    expect(tradeWarning(view, b(0), b(0), 60)).toBeNull();
  });

  it("typed cash: digits only, clamped to what the player has", () => {
    expect(clampCash("250", 400)).toBe(250);
    expect(clampCash("₦1,200", 400)).toBe(400);
    expect(clampCash("", 400)).toBe(0);
    expect(clampCash("abc", 400)).toBe(0);
  });
});
