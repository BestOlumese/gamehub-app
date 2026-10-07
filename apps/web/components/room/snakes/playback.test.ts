import { HOP_MS, ROLL_SHOW_MS, SETTLE_MS, SLIDE_MS } from "@gamehub/engine/snakes";
import { describe, expect, it } from "vitest";
import { SnakesPlayback } from "./playback";

function run(before: number[], events: Array<{ type: string } & Record<string, unknown>>) {
  const timers: Array<{ at: number; fn: () => void }> = [];
  let now = 0;
  const boards: Array<{ at: number; squares: number[] | null }> = [];
  const slides: number[] = [];
  const pb = new SnakesPlayback({
    board: (squares) => boards.push({ at: now, squares }),
    slide: (s) => s && slides.push(now),
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
  return { boards, slides, end: now };
}

describe("snakes playback", () => {
  it("holds the board while the die spins, hops forward, then slides down the snake", () => {
    const { boards, slides, end } = run(
      [15, 0],
      [
        { type: "rolled", seat: 0, d: 4 },
        { type: "moved", seat: 0, from: 15, to: 19, path: [16, 17, 18, 19] },
        { type: "snake", seat: 0, from: 19, to: 6 },
      ],
    );
    expect(boards[0]).toEqual({ at: 0, squares: [15, 0] });
    const seen = boards.filter((b) => b.squares).map((b) => b.squares![0]);
    expect(seen).toEqual([15, 16, 17, 18, 19, 6]); // never the end square early, never backwards before the snake
    expect(boards.find((b) => b.squares?.[0] === 16)!.at).toBe(ROLL_SHOW_MS);
    expect(slides.length).toBeGreaterThan(10); // the slide is animated along the curve
    expect(end).toBeGreaterThanOrEqual(ROLL_SHOW_MS + 4 * HOP_MS + SETTLE_MS + SLIDE_MS);
    expect(boards.at(-1)!.squares).toBeNull();
  });

  it("a bumped token goes back to the start after the mover lands", () => {
    const { boards } = run(
      [10, 14],
      [
        { type: "rolled", seat: 0, d: 4 },
        { type: "moved", seat: 0, from: 10, to: 14, path: [11, 12, 13, 14] },
        { type: "bumped", seat: 0, victim: 1, from: 14 },
      ],
    );
    const seen = boards.filter((b) => b.squares).map((b) => b.squares!.join(","));
    expect(seen).toEqual(["10,14", "11,14", "12,14", "13,14", "14,14", "14,0"]);
  });
});
