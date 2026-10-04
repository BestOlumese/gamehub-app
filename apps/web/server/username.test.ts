import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({
  getDb: () => {
    throw new Error("no db in unit tests");
  },
}));

const { checkUsernameRules, isOffensive, usernameBase } = await import("./username");

describe("username rules", () => {
  it("accepts normal names and lowercases them", () => {
    expect(checkUsernameRules("Tunde_99")).toEqual({ ok: true, username: "tunde_99" });
  });

  it("enforces format", () => {
    expect(checkUsernameRules("ab")).toMatchObject({ reason: "too_short" });
    expect(checkUsernameRules("a".repeat(21))).toMatchObject({ reason: "too_long" });
    expect(checkUsernameRules("ada.o")).toMatchObject({ reason: "bad_chars" });
    expect(checkUsernameRules("_ada")).toMatchObject({ reason: "edge_underscore" });
  });

  it("blocks reserved names", () => {
    expect(checkUsernameRules("admin")).toMatchObject({ reason: "not_allowed" });
    expect(checkUsernameRules("GameHub")).toMatchObject({ reason: "not_allowed" });
  });

  it("blocks English and Naija profanity", () => {
    expect(isOffensive("fuck_you")).toBe(true);
    expect(isOffensive("big_ashawo")).toBe(true);
    expect(isOffensive("ashawo2000")).toBe(true);
    expect(isOffensive("toto_9")).toBe(true);
  });

  it("doesn't flag ordinary names that contain short words", () => {
    for (const ok of ["okoro", "okonkwo", "tototo", "odeh_ben", "ewuare", "olebara"]) {
      expect(isOffensive(ok), ok).toBe(false);
    }
  });

  it("builds a base from a name or email", () => {
    expect(usernameBase("Tunde Ọlá")).toBe("tunde_ola");
    expect(usernameBase("ada.eze99@gmail.com")).toBe("ada_eze99");
    expect(usernameBase("Jo")).toBe("player_jo");
  });
});
