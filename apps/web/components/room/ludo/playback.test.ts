import { HOP_MS, ROLL_SHOW_MS, SETTLE_MS } from "@gamehub/engine/ludo";
import { describe, expect, it } from "vitest";
import { LudoPlayback } from "./playback";

/** Runs the playback on a fake clock and records every board it shows, with times. */
function run(before: number[][], events: Array<{ type: string } & Record<string, unknown>>) {
  const timers: Array<{ at: number; fn: () => void }> = [];
  let now = 0;
  const boards: Array<{ at: number; seeds: number[][] | null }> = [];
  const pb = new LudoPlayback({
    board: (seeds) => boards.push({ at: now, seeds }),
    actor: () => {},
    event: () => {},
    hop: () => {},
    wait: (ms, fn) => timers.push({ at: now + ms, fn }),
  });
  pb.push(events, before);
  while (timers.length) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers.shift()!;
    now = t.at;
    t.fn();
  }
  return { boards, end: now, busy: pb.busy };
}

describe("ludo playback", () => {
  const before = [
    [10, -1, -1, -1],
    [-1, -1, -1, -1],
  ];

  it("holds the old board while the die spins, then hops forward one square at a time", () => {
    const { boards, end, busy } = run(before, [
      { type: "rolled", seat: 0, d: 3 },
      { type: "moved", seat: 0, seed: 0, from: 10, to: 13, path: [11, 12, 13] },
    ]);
    // Shown at once (before the snapshot can show the end position), and unchanged during the roll.
    expect(boards[0]).toEqual({ at: 0, seeds: before });
    const seed0 = boards.filter((b) => b.seeds).map((b) => b.seeds![0]![0]);
    expect(seed0).toEqual([10, 11, 12, 13]);
    // Never goes backwards, and the first hop only starts after the die.
    const firstHop = boards.find((b) => b.seeds?.[0]?.[0] === 11)!;
    expect(firstHop.at).toBe(ROLL_SHOW_MS);
    expect(end).toBe(ROLL_SHOW_MS + 3 * HOP_MS + SETTLE_MS);
    expect(boards.at(-1)).toEqual({ at: end, seeds: null }); // hand back to the snapshot
    expect(busy).toBe(false);
  });

  it("a forced move out of the yard: one hop onto the start square", () => {
    const { boards } = run(before, [
      { type: "rolled", seat: 0, d: 6 },
      { type: "moved", seat: 0, seed: 1, from: -1, to: 0, path: [0] },
    ]);
    const seed1 = boards.filter((b) => b.seeds).map((b) => b.seeds![0]![1]);
    expect(seed1).toEqual([-1, 0]);
  });

  it("a captured seed stays on the square until the hopper lands on it", () => {
    const start = [
      [2, -1, -1, -1],
      [31, -1, -1, -1],
    ];
    const { boards } = run(start, [
      { type: "rolled", seat: 0, d: 3 },
      { type: "moved", seat: 0, seed: 0, from: 2, to: 5, path: [3, 4, 5] },
      { type: "captured", by: 0, victimSeat: 1, seed: 0 },
    ]);
    const shown = boards.filter((b) => b.seeds).map((b) => [b.seeds![0]![0], b.seeds![1]![0]]);
    expect(shown).toEqual([
      [2, 31],
      [3, 31],
      [4, 31],
      [5, 31],
      [5, -1],
    ]);
  });

  it("a second burst arriving mid-playback continues from where the first left off", () => {
    const timers: Array<{ at: number; fn: () => void }> = [];
    let now = 0;
    const positions: number[] = [];
    const pb = new LudoPlayback({
      board: (s) => s && positions.push(s[0]![0]!),
      actor: () => {},
      event: () => {},
      hop: () => {},
      wait: (ms, fn) => timers.push({ at: now + ms, fn }),
    });
    pb.push(
      [
        { type: "rolled", seat: 0, d: 6 },
        { type: "moved", seat: 0, seed: 0, from: 10, to: 16, path: [11, 12, 13, 14, 15, 16] },
      ],
      before,
    );
    // The snapshot has moved on, but the next burst must not restart from it.
    pb.push(
      [
        { type: "rolled", seat: 0, d: 2 },
        { type: "moved", seat: 0, seed: 0, from: 16, to: 18, path: [17, 18] },
      ],
      [
        [16, -1, -1, -1],
        [-1, -1, -1, -1],
      ],
    );
    while (timers.length) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers.shift()!;
      now = t.at;
      t.fn();
    }
    expect(positions).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });
});
