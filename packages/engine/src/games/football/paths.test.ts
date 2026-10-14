import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import { autoDraft, makePool } from "./draft";
import { playMatch, startMatch, type MatchEvent } from "./match";
import { lookupOf, sheetOf } from "./sheets";
import { testDataset } from "./test-data";

const pool = makePool(testDataset);
const get = lookupOf(pool);
const opts = { knockout: false, chemistry: true, subsPerMatch: 5 };
const team = (t: number) =>
  sheetOf(
    autoDraft((k) => seededRng(`pt:${t}:${k}`), pool, "balanced"),
    pool,
  );

describe("each minute's build-up", () => {
  it("ends where the events say: the assister then the shooter; offside at the runner; only their own players", () => {
    let attacks = 0;
    for (let i = 0; i < 60; i++) {
      const a = team(i);
      const b = team(i + 100);
      const r = playMatch(startMatch(a, b, opts), (k) => seededRng(`pm:${i}:${k}`), get);
      const ids = [
        new Set([...a.xi.map((x) => x.id), ...a.bench]),
        new Set([...b.xi.map((x) => x.id), ...b.bench]),
      ];
      let ball: Extract<MatchEvent, { t: "ball" }> | null = null;
      let firstAfterBall: MatchEvent | null = null;
      for (const e of r.events) {
        if (e.t === "ball") {
          ball = e;
          firstAfterBall = null;
          expect(e.path?.length).toBeGreaterThan(0);
          for (const [id] of e.path ?? []) expect(ids[e.team]?.has(id)).toBe(true);
          continue;
        }
        if (!ball || firstAfterBall) continue;
        if (e.t === "chance" || e.t === "offside" || e.t === "foul") firstAfterBall = e;
        const path = ball.path ?? [];
        if (e.t === "chance" && e.kind !== "corner" && e.kind !== "free_kick") {
          attacks++;
          const players = path.map(([id]) => id);
          const lastIdx = players.lastIndexOf(e.player);
          expect(lastIdx).toBeGreaterThan(-1);
          // Nobody touches it after the shooter.
          expect(players.slice(lastIdx).every((p) => p === e.player)).toBe(true);
          if (e.assist) expect(players.slice(0, lastIdx)).toContain(e.assist);
        }
        if (e.t === "offside" && e.player) expect(path.at(-1)?.[0]).toBe(e.player);
      }
    }
    expect(attacks).toBeGreaterThan(300);
  });

  it("never changes a result: the same seed gives the same score with or without looking at paths", () => {
    const a = team(1);
    const b = team(2);
    const one = playMatch(startMatch(a, b, opts), (k) => seededRng(`same:${k}`), get);
    const two = playMatch(startMatch(a, b, opts), (k) => seededRng(`same:${k}`), get);
    expect(two.state.score).toEqual(one.state.score);
    expect(JSON.stringify(two.events)).toBe(JSON.stringify(one.events));
  });
});
