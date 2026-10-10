import { describe, expect, it } from "vitest";
import { tokensFor } from "./token-pick";

describe("Naija Plots tokens", () => {
  it("people keep what they picked; everyone else gets the first free one, in seat order", () => {
    expect(tokensFor([{}, {}, {}])).toEqual([0, 1, 2]);
    expect(tokensFor([{ token: null }, { token: 0 }, {}, { token: 2 }])).toEqual([1, 0, 3, 2]);
    expect(tokensFor(Array.from({ length: 8 }, (_, i) => ({ token: i === 7 ? 0 : null })))).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 0],
    );
  });
});
