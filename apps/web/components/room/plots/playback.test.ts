import { describe, expect, it } from "vitest";
import { hopPath, PlotsPlayback } from "./playback";

describe("Naija Plots playback", () => {
  it("hop paths wrap past Payday and run backwards for 'move back'", () => {
    expect(hopPath(37, 5)).toEqual([38, 39, 0, 1, 2]);
    expect(hopPath(2, -3)).toEqual([1, 0, 39]);
  });

  it("plays from the position before the burst: dice, hops, the Police Post, then the snapshot", () => {
    const boards: Array<number[] | null> = [];
    const queue: Array<() => void> = [];
    const pb = new PlotsPlayback({
      board: (b) => boards.push(b),
      dice: () => {},
      event: () => {},
      hop: () => {},
      wait: (_ms, fn) => queue.push(fn),
    });
    pb.push(
      [
        { type: "rolled", seat: 0, dice: [1, 2] },
        { type: "moved", seat: 0, from: 27, to: 30, steps: 3 },
        { type: "police", seat: 0 },
      ],
      [27, 0],
    );
    while (queue.length) queue.shift()?.();
    expect(boards.filter(Boolean).map((b) => b?.[0])).toEqual([27, 28, 29, 30, 10]);
    expect(boards.at(-1)).toBeNull();
    expect(pb.busy).toBe(false);
  });
});
