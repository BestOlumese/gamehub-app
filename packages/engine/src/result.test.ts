import { describe, expect, it } from "vitest";
import { err, ok } from "./result";

describe("result helpers", () => {
  it("wraps a state with no events by default", () => {
    expect(ok({ n: 1 })).toEqual({ ok: true, state: { n: 1 }, events: [] });
  });

  it("wraps a rule error without throwing", () => {
    expect(err("NOT_YOUR_TURN")).toEqual({ ok: false, error: "NOT_YOUR_TURN" });
  });
});
