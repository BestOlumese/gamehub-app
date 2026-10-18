import { describe, expect, it } from "vitest";
import { cleanChat, isOffensiveName } from "./moderation";

describe("chat cleaning", () => {
  it("one line, trimmed, at most 200 characters; empty is refused", () => {
    expect(cleanChat("  who dey\nplay​ next?  ")).toEqual({
      ok: true,
      text: "who dey play next?",
      censored: false,
    });
    const long = cleanChat("a".repeat(300));
    expect(long.ok && long.text.length).toBe(200);
    expect(cleanChat(" \n ")).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("links are refused; phone numbers masked", () => {
    for (const t of ["see https://x.y", "go to www.site", "check mysite.com o", "join bit.ly/abc"])
      expect(cleanChat(t)).toEqual({ ok: false, reason: "LINK" });
    const phone = cleanChat("call me 0803 123 4567 abeg");
    expect(phone.ok && phone.text).toBe("call me •••• ••• •••• abeg");
    expect(cleanChat("I scored 12 goals").ok && cleanChat("I scored 12 goals")).toMatchObject({
      text: "I scored 12 goals",
    });
  });

  it("insults are starred out, not refused; ordinary words stay", () => {
    const en = cleanChat("you are a fucking idiot");
    expect(en.ok && en.censored).toBe(true);
    expect(en.ok && en.text).not.toContain("fucking");
    const naija = cleanChat("Mumu! You be werey");
    expect(naija).toEqual({ ok: true, text: "****! You be *****", censored: true });
    // "were", "ode", "ole" and "oko" are everyday words in a sentence.
    expect(
      cleanChat("we were at the ode market with oko").ok &&
        cleanChat("we were at the ode market with oko"),
    ).toMatchObject({ censored: false });
  });

  it("names: the same lists, stricter (whole parts)", () => {
    expect(isOffensiveName("ashawo_99")).toBe(true);
    expect(isOffensiveName("okoro")).toBe(false);
    expect(isOffensiveName("tunde_ola")).toBe(false);
  });
});
