import { describe, expect, it } from "vitest";
import { ageOn, isAdult, isRealDate, todayInLagos } from "./age";

const d = (year: number, month: number, day: number) => ({ year, month, day });

describe("age gate", () => {
  it("allows someone on their 18th birthday", () => {
    expect(isAdult(d(2008, 10, 4), d(2026, 10, 4))).toBe(true);
  });

  it("refuses someone the day before their 18th birthday", () => {
    expect(isAdult(d(2008, 10, 5), d(2026, 10, 4))).toBe(false);
  });

  it("handles leap-day birthdays", () => {
    // Born 29 Feb 2008: not 18 on 28 Feb 2026, 18 on 1 Mar 2026.
    expect(ageOn(d(2008, 2, 29), d(2026, 2, 28))).toBe(17);
    expect(ageOn(d(2008, 2, 29), d(2026, 3, 1))).toBe(18);
    // In a leap year they turn 18 on 29 Feb itself.
    expect(ageOn(d(2006, 2, 28), d(2024, 2, 29))).toBe(18);
  });

  it("rejects dates that don't exist", () => {
    expect(isRealDate(d(2001, 2, 29))).toBe(false);
    expect(isRealDate(d(2000, 2, 29))).toBe(true);
    expect(isRealDate(d(1990, 4, 31))).toBe(false);
    expect(isRealDate(d(1990, 13, 1))).toBe(false);
    expect(isAdult(d(1990, 4, 31), d(2026, 10, 4))).toBe(false);
  });

  it("uses Lagos time for today", () => {
    // 23:30 UTC on 3 Oct is 00:30 on 4 Oct in Lagos.
    expect(todayInLagos(new Date("2026-10-03T23:30:00Z"))).toEqual(d(2026, 10, 4));
  });
});
