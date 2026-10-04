import { describe, expect, it } from "vitest";
import { colourFor, initialsFor } from "./avatar";

describe("avatar", () => {
  it("builds initials from username parts", () => {
    expect(initialsFor("tunde_o")).toBe("TO");
    expect(initialsFor("ada99")).toBe("AD");
    expect(initialsFor("naija_king_23")).toBe("NK");
    expect(initialsFor("x")).toBe("X");
  });
  it("gives a username the same colour every time", () => {
    expect(colourFor("tunde_o")).toBe(colourFor("tunde_o"));
  });
});
