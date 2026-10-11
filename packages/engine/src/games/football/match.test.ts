import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import { ALL_LINES, commentary } from "./commentary";
import { autoDraft, makePool, type Luck } from "./draft";
import {
  applyChange,
  DEFAULT_TACTICS,
  playHalf,
  playMatch,
  shootout,
  startMatch,
  whyNotChange,
  winner,
  type MatchEvent,
  type MatchState,
  type TeamSheet,
} from "./match";
import { sheetOf } from "./sheets";
import { testDataset } from "./test-data";

const pool = makePool(testDataset);
const N = Number(process.env.MATCHES ?? 1500);
const opts = { knockout: false, chemistry: true, subsPerMatch: 5 };
const teams = Array.from({ length: 120 }, (_, t) =>
  autoDraft((k) => seededRng(`mt:${t}:${k}`), pool, "balanced"),
);
const sheet = (i: number) => sheetOf(teams[i % teams.length] as (typeof teams)[number], pool);

/** Invariants on a finished match (match-engine.md → Tests). */
function check(s: MatchState, ev: MatchEvent[]) {
  const goals = [0, 0];
  const shots = [0, 0];
  for (const e of ev) {
    if (e.t === "goal") goals[e.team] = (goals[e.team] ?? 0) + 1;
    if (e.t === "shot") shots[e.team] = (shots[e.team] ?? 0) + 1;
  }
  expect(goals).toEqual(s.score);
  expect(shots).toEqual(s.stats.shots);
  for (const t of s.teams) {
    expect(t.xi).toHaveLength(11);
    expect(t.subsUsed).toBeLessThanOrEqual(6);
  }
  expect(s.stats.possession[0] + s.stats.possession[1]).toBe(100);
}

describe("football match engine", () => {
  it("same seed, same match; a different seed, a different one", () => {
    const a = playMatch(startMatch(sheet(0), sheet(1), opts), seededRng("same"));
    const b = playMatch(startMatch(sheet(0), sheet(1), opts), seededRng("same"));
    const c = playMatch(startMatch(sheet(0), sheet(1), opts), seededRng("other"));
    expect(a.events).toEqual(b.events);
    expect(a.state).toEqual(b.state);
    expect(c.events).not.toEqual(a.events);
  });

  it("halves: kickoff and half time, then full time; stats match the events", () => {
    let s = startMatch(sheet(2), sheet(3), opts);
    const h1 = playHalf(s, seededRng("h1"));
    expect(h1.events[0]?.t).toBe("kickoff");
    expect(h1.events.at(-1)?.t).toBe("half_time");
    s = h1.state;
    const h2 = playHalf(s, seededRng("h2"));
    expect(h2.events.at(-1)?.t).toBe("full_time");
    check(h2.state, [...h1.events, ...h2.events]);
    expect(winner(h2.state)).not.toBeNull();
  });

  it("knockouts: level after 90 → extra time, then penalties that alternate and end right", () => {
    let found = 0;
    for (let i = 0; i < 300 && found < 5; i++) {
      const r = playMatch(
        startMatch(sheet(i), sheet(i + 1), { ...opts, knockout: true }),
        seededRng(`ko${i}`),
      );
      expect(winner(r.state)).not.toBe("draw");
      if (!r.state.pens) continue;
      found++;
      expect(r.state.halves).toBe(4);
      const pens = r.events.filter((e) => e.t === "pen");
      pens.forEach((e, k) => expect(e.team).toBe(k % 2));
      const last = pens.at(-1);
      expect(last?.t === "pen" && last.tally[0] !== last.tally[1]).toBe(true);
    }
    expect(found).toBeGreaterThan(0);
  });

  it("half-time changes: subs come on fresh, and run out at the limit", () => {
    let s = playHalf(startMatch(sheet(4), sheet(5), opts), seededRng("x")).state;
    const t = s.teams[0];
    for (let k = 0; k < 5; k++) {
      const off = t.xi[k + 1]?.player.id as string;
      const on = s.teams[0].bench[0]?.id as string;
      expect(whyNotChange(s, 0, { type: "sub", off, on })).toBeNull();
      s = applyChange(s, 0, { type: "sub", off, on }, 45).state;
    }
    expect(s.teams[0].subsUsed).toBe(5);
    const on = s.teams[0].bench[0]?.id as string;
    expect(
      whyNotChange(s, 0, { type: "sub", off: s.teams[0].xi[9]?.player.id as string, on }),
    ).toBe("No subs left");
    expect(s.teams[0].xi[1]?.fit).toBe(100);
  });

  it("tactics: long ball makes direct attacks; a high line against pace gives more through balls", () => {
    const count = (
      mk: (s: TeamSheet) => TeamSheet,
      kind: string,
      other?: (s: TeamSheet) => TeamSheet,
    ) => {
      let n = 0;
      for (let i = 0; i < 200; i++) {
        const a = mk(sheet(i));
        const b = (other ?? ((x) => x))(sheet(i + 7));
        const r = playMatch(startMatch(a, b, opts), seededRng(`t${i}`));
        n += r.events.filter((e) => e.t === "chance" && e.team === 0 && e.kind === kind).length;
      }
      return n;
    };
    const long = (s: TeamSheet) => ({
      ...s,
      tactics: { ...DEFAULT_TACTICS, build: "long" as const },
    });
    expect(count(long, "direct")).toBeGreaterThan(count((s) => s, "direct") + 50);
    const highLine = (s: TeamSheet) => ({ ...s, tactics: { ...DEFAULT_TACTICS, line: 90 } });
    expect(count((s) => s, "through_ball", highLine)).toBeGreaterThan(
      count((s) => s, "through_ball"),
    );
  });

  it("commentary: every event gets a line or none, templates have no banned words", () => {
    const r = playMatch(
      startMatch(sheet(8), sheet(9), { ...opts, knockout: true }),
      seededRng("c"),
    );
    const names = {
      player: (id: string) => pool.byId.get(id)?.short ?? "?",
      team: (s: 0 | 1) => (s ? "Away" : "Home"),
    };
    for (const e of r.events) {
      const line = commentary(e, names, r.state.score);
      if (line !== null) expect(line).not.toMatch(/\{|\}|undefined|\?/);
    }
    for (const l of ALL_LINES) expect(l).not.toMatch(/\bFUT\b|ultimate team|\bicons?\b/i);
    const s = shootout(r.state, seededRng("p")).events[0];
    if (s) expect(commentary(s, names, [1, 1])).toMatch(/scores|wrong way|saved|misses/);
  });
});

describe("match calibration (bands in match-engine.md)", () => {
  it(`${N} matches between equal-strength drafted teams`, () => {
    const acc = {
      goals: 0,
      draws: 0,
      nil: 0,
      shots: 0,
      on: 0,
      xg: 0,
      yel: 0,
      red: 0,
      pens: 0,
      ko: 0,
    };
    const pos: number[] = [];
    for (let i = 0; i < N; i++) {
      const r = playMatch(startMatch(sheet(i), sheet(i * 7 + 3), opts), seededRng(`cal:${i}`));
      check(r.state, r.events);
      const st = r.state.stats;
      acc.goals += r.state.score[0] + r.state.score[1];
      if (r.state.score[0] === r.state.score[1]) acc.draws++;
      if (r.state.score[0] + r.state.score[1] === 0) acc.nil++;
      acc.shots += st.shots[0] + st.shots[1];
      acc.on += st.onTarget[0] + st.onTarget[1];
      acc.xg += st.xg[0] + st.xg[1];
      acc.yel += st.yellows[0] + st.yellows[1];
      acc.red += st.reds[0] + st.reds[1];
      pos.push(st.possession[0]);
      if (i % 2 === 0) {
        acc.ko++;
        const k = playMatch(
          startMatch(sheet(i), sheet(i * 7 + 3), { ...opts, knockout: true }),
          seededRng(`ko:${i}`),
        );
        if (k.state.pens) acc.pens++;
      }
    }
    pos.sort((a, b) => a - b);
    const r = {
      goals: acc.goals / N,
      draws: acc.draws / N,
      nil: acc.nil / N,
      shotsPerTeam: acc.shots / N / 2,
      onShare: acc.on / acc.shots,
      xgPerShot: acc.xg / acc.shots,
      yellows: acc.yel / N,
      reds: acc.red / N,
      pos5: pos[Math.floor(N * 0.05)] as number,
      pos95: pos[Math.floor(N * 0.95)] as number,
      pens: acc.pens / acc.ko,
      meanPos: pos.reduce((a, b) => a + b, 0) / N,
    };
    console.log(JSON.stringify(r));
    expect(r.goals).toBeGreaterThanOrEqual(2.55);
    expect(r.goals).toBeLessThanOrEqual(2.95);
    expect(r.draws).toBeGreaterThanOrEqual(0.22);
    expect(r.draws).toBeLessThanOrEqual(0.29);
    expect(r.nil).toBeGreaterThanOrEqual(0.05);
    expect(r.nil).toBeLessThanOrEqual(0.1);
    expect(r.shotsPerTeam).toBeGreaterThanOrEqual(10.5);
    expect(r.shotsPerTeam).toBeLessThanOrEqual(14.5);
    expect(r.onShare).toBeGreaterThanOrEqual(0.3);
    expect(r.onShare).toBeLessThanOrEqual(0.4);
    expect(r.xgPerShot).toBeGreaterThanOrEqual(0.09);
    expect(r.xgPerShot).toBeLessThanOrEqual(0.13);
    expect(r.yellows).toBeGreaterThanOrEqual(2.5);
    expect(r.yellows).toBeLessThanOrEqual(4.5);
    expect(r.reds).toBeGreaterThanOrEqual(0.05);
    expect(r.reds).toBeLessThanOrEqual(0.2);
    expect(r.meanPos).toBeGreaterThanOrEqual(49);
    expect(r.meanPos).toBeLessThanOrEqual(51);
    expect(r.pos5).toBeGreaterThanOrEqual(36);
    expect(r.pos95).toBeLessThanOrEqual(64);
    expect(r.pens).toBeGreaterThanOrEqual(0.08);
    expect(r.pens).toBeLessThanOrEqual(0.16);
  }, 900_000);

  it("a better team usually wins, with real upsets (win rate by rating gap)", () => {
    const lucks: Luck[] = [
      { tiers: [0, 0, 0, 1, 10], legend: 0, wonderkid: 1, floor: 0, jackpot: 0 },
      { tiers: [0, 0, 1, 6, 6], legend: 0, wonderkid: 1, floor: 0, jackpot: 0 },
      { tiers: [0, 1, 6, 6, 2], legend: 0, wonderkid: 1, floor: 0, jackpot: 0 },
      { tiers: [1, 5, 11, 12, 6], legend: 0.06, wonderkid: 1.3, floor: 80, jackpot: 20 },
      { tiers: [5, 8, 8, 2, 0], legend: 0.05, wonderkid: 1, floor: 84, jackpot: 30 },
      { tiers: [8, 6, 1, 0, 0], legend: 0.3, wonderkid: 1, floor: 86, jackpot: 30 },
    ];
    const byRating = new Map<number, ReturnType<typeof autoDraft>[]>();
    lucks.forEach((L, li) => {
      for (let t = 0; t < 120; t++) {
        const team = autoDraft((k) => seededRng(`gap:${li}:${t}:${k}`), pool, L);
        byRating.set(team.rating, [...(byRating.get(team.rating) ?? []), team]);
      }
    });
    const bands: Record<number, [number, number]> = {
      3: [0.46, 0.54],
      5: [0.55, 0.64],
      10: [0.72, 0.84],
      15: [0.84, 0.93],
    };
    const games = Math.max(600, Math.round(N / 2));
    for (const gap of [3, 5, 10, 15]) {
      const pairs: Array<[ReturnType<typeof autoDraft>, ReturnType<typeof autoDraft>]> = [];
      for (const [r, ts] of byRating) {
        const weak = byRating.get(r - gap);
        if (weak)
          for (let i = 0; i < Math.min(ts.length, weak.length); i++)
            pairs.push([ts[i]!, weak[(i + 1) % weak.length]!]);
      }
      let w = 0;
      for (let i = 0; i < games; i++) {
        const [a, b] = pairs[i % pairs.length]!;
        const s = playMatch(
          startMatch(sheetOf(a, pool), sheetOf(b, pool), opts),
          seededRng(`g:${gap}:${i}`),
        ).state;
        if (s.score[0] > s.score[1]) w++;
      }
      console.log(`gap ${gap}: win ${(w / games).toFixed(3)} (${pairs.length} pairs)`);
      const [lo, hi] = bands[gap] as [number, number];
      expect(w / games).toBeGreaterThanOrEqual(lo);
      expect(w / games).toBeLessThanOrEqual(hi);
    }
  }, 900_000);
});
