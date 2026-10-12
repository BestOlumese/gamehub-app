import { FORMATIONS } from "@gamehub/engine/football";
import { describe, expect, it } from "vitest";
import { formationLean } from "./look";

describe("formation lean", () => {
  it("says what the name doesn't: lean, width and the middle", () => {
    const by = (name: string) => formationLean(FORMATIONS.find((f) => f.name === name)!.id);
    expect(by("4-2-4")).toBe("Attacking · wingers, a flat midfield");
    expect(by("5-3-2 Holding")).toBe("Defensive · wing-backs, two holding midfielders");
    expect(by("4-1-2-1-2 Narrow")).toBe("Balanced · narrow, a playmaker");
    for (const f of FORMATIONS) expect(formationLean(f.id)).toMatch(/^[A-Z][a-z-]+ · /);
  });
});
