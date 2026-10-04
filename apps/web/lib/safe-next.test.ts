import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/r/ABC123")).toBe("/r/ABC123");
  });
  it("rejects anything that could leave the site", () => {
    for (const bad of [
      "https://evil.ng",
      "//evil.ng",
      "/\\evil.ng",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      expect(safeNext(bad)).toBe("/home");
    }
  });
});
