import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendChange } from "./live-changes";

describe("live changes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("in a match, changes are spaced past the server's 2 s gap; the latest tactics win", () => {
    const sent: string[] = [];
    sendChange("tactics", () => sent.push("line 40"), true);
    expect(sent).toEqual(["line 40"]);
    // Dragging on: each step replaces the waiting one.
    sendChange("tactics", () => sent.push("line 50"), true);
    sendChange("tactics", () => sent.push("line 60"), true);
    sendChange("role:3", () => sent.push("role"), true);
    vi.advanceTimersByTime(2100);
    expect(sent).toEqual(["line 40"]);
    vi.advanceTimersByTime(200);
    expect(sent).toEqual(["line 40", "line 60"]);
    vi.advanceTimersByTime(2200);
    expect(sent).toEqual(["line 40", "line 60", "role"]);
  });

  it("outside a match they go at once", () => {
    const sent: number[] = [];
    for (let i = 0; i < 3; i++) sendChange("tactics", () => sent.push(i), false);
    expect(sent).toEqual([0, 1, 2]);
  });
});
