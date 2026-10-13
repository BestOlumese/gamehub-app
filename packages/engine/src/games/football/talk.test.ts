import { describe, expect, it } from "vitest";
import { reactionLine, talkReaction } from "./talk";

describe("half-time team talk", () => {
  it("the right talk depends on the score and how the half really went", () => {
    // Two up: praise them; demanding more feels unfair.
    expect(talkReaction("praise", 2, 0)).toBe("good");
    expect(talkReaction("demand", 2, 0)).toBe("bad");
    // Level: fire them up.
    expect(talkReaction("fire", 0, 0)).toBe("good");
    // One down but played well (unlucky): praise works, demanding doesn't.
    expect(talkReaction("praise", -1, 0.6)).toBe("good");
    expect(talkReaction("demand", -1, 0.6)).toBe("bad");
    // One down and played badly: demand more; praise makes them complacent.
    expect(talkReaction("demand", -1, -0.6)).toBe("good");
    expect(talkReaction("praise", -1, -0.6)).toBe("bad");
    // Two down: demand or fire; never praise.
    expect(talkReaction("praise", -3, 0)).toBe("bad");
    expect(reactionLine("praise", "bad")).toBe("They look complacent.");
  });
});
