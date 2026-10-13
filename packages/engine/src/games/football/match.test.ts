import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import { ALL_LINES, commentary } from "./commentary";
import { autoDraft, makePool, type Luck } from "./draft";
import {
  applyChange,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_TACTICS,
  fatigueMod,
  playMatch as play,
  playMinutes,
  shootout,
  startHalf,
  startMatch,
  whyNotChange,
  winner,
  type Instructions,
  type MatchEvent,
  type MatchState,
  type TeamSheet,
} from "./match";
import { formation } from "./pitch";
import { lookupOf, sheetOf } from "./sheets";
import { testDataset } from "./test-data";

const pool = makePool(testDataset);
const get = lookupOf(pool);
const streams = (seed: string) => (key: string) => seededRng(`${seed}:${key}`);
/** A whole match with no changes, all streams from one seed. */
const playMatch = (s: MatchState, rng: { seed: string }) => play(s, streams(rng.seed), get);
const playHalf = (s: MatchState, rng: { seed: string }) => {
  const k = startHalf(s, streams(rng.seed));
  const r = playMinutes(k.state, 999, streams(rng.seed), get);
  return { state: r.state, events: [...k.events, ...r.events] };
};
const R = (seed: string) => ({ seed });
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
    const a = playMatch(startMatch(sheet(0), sheet(1), opts), R("same"));
    const b = playMatch(startMatch(sheet(0), sheet(1), opts), R("same"));
    const c = playMatch(startMatch(sheet(0), sheet(1), opts), R("other"));
    expect(a.events).toEqual(b.events);
    expect(a.state).toEqual(b.state);
    expect(c.events).not.toEqual(a.events);
  });

  it("halves: kickoff and half time, then full time; stats match the events", () => {
    let s = startMatch(sheet(2), sheet(3), opts);
    const h1 = playHalf(s, R("h1"));
    expect(h1.events[0]?.t).toBe("kickoff");
    expect(h1.events.at(-1)?.t).toBe("half_time");
    s = h1.state;
    const h2 = playHalf(s, R("h2"));
    expect(h2.events.at(-1)?.t).toBe("full_time");
    check(h2.state, [...h1.events, ...h2.events]);
    expect(winner(h2.state)).not.toBeNull();
  });

  it("knockouts: level after 90 → extra time, then penalties that alternate and end right", () => {
    let found = 0;
    for (let i = 0; i < 300 && found < 5; i++) {
      const r = playMatch(
        startMatch(sheet(i), sheet(i + 1), { ...opts, knockout: true }),
        R(`ko${i}`),
      );
      expect(winner(r.state)).not.toBe("draw");
      if (!r.state.pens) continue;
      found++;
      expect(r.state.half).toBe(4);
      const pens = r.events.filter((e) => e.t === "pen");
      pens.forEach((e, k) => expect(e.team).toBe(k % 2));
      const last = pens.at(-1);
      expect(last?.t === "pen" && last.tally[0] !== last.tally[1]).toBe(true);
    }
    expect(found).toBeGreaterThan(0);
  });

  it("half-time changes: subs come on fresh, and run out at the limit", () => {
    let s = playHalf(startMatch(sheet(4), sheet(5), opts), R("x")).state;
    const t = s.teams[0];
    for (let k = 0; k < 5; k++) {
      const off = t.xi[k + 1]?.id as string;
      const on = s.teams[0].bench[0] as string;
      expect(whyNotChange(s, 0, { type: "sub", off, on })).toBeNull();
      s = applyChange(s, 0, { type: "sub", off, on }).state;
    }
    expect(s.teams[0].subsUsed).toBe(5);
    const on = s.teams[0].bench[0] as string;
    expect(whyNotChange(s, 0, { type: "sub", off: s.teams[0].xi[9]?.id as string, on })).toBe(
      "No subs left",
    );
    expect(s.teams[0].xi[1]?.fit).toBe(100);
  });

  it("stamina: workload, POW and pressing decide who tires; a breather at half time; a warning once", () => {
    const base = startMatch(sheet(7), sheet(8), opts);
    const pressed = {
      ...base,
      teams: [
        {
          ...base.teams[0],
          tactics: { ...base.teams[0].tactics, defence: "high_press" as const, tempo: 80 },
        },
        base.teams[1],
      ] as typeof base.teams,
    };
    const h1 = playHalf(pressed, R("st"));
    const avg = (side: 0 | 1, pos: string[]) => {
      const xs = h1.state.teams[side].xi.filter((x) => pos.includes(x.pos) && !x.off);
      return xs.reduce((a, x) => a + x.fit, 0) / Math.max(1, xs.length);
    };
    // A pressing, high-tempo side tires faster than one at default settings.
    expect(avg(0, ["CB", "RB", "LB", "CM", "DM", "AM", "ST"])).toBeLessThan(
      avg(1, ["CB", "RB", "LB", "CM", "DM", "AM", "ST"]),
    );
    // Keepers barely tire; outfielders do.
    const gk = h1.state.teams[1].xi.find((x) => x.pos === "GK")!;
    expect(gk.fit).toBeGreaterThan(90);
    expect(avg(1, ["CM", "DM", "RB", "LB"])).toBeLessThan(85);
    // A breather at the break.
    const before = h1.state.teams[1].xi.map((x) => x.fit);
    const h2 = startHalf(h1.state, streams("st"));
    h2.state.teams[1].xi.forEach((x, i) => {
      if (!x.off) expect(x.fit).toBeCloseTo(Math.min(100, (before[i] as number) + 8), 5);
    });
    // Over a whole match someone runs on empty, and is announced once.
    const full = playMatch(pressed, R("st"));
    const tired = full.events.filter((e) => e.t === "tired");
    expect(tired.length).toBeGreaterThan(0);
    expect(new Set(tired.map((e) => (e as { player: string }).player)).size).toBe(tired.length);
    expect(fatigueMod(100)).toBe(0);
    expect(fatigueMod(25)).toBe(-8);
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
        const r = playMatch(startMatch(a, b, opts), R(`t${i}`));
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
    const r = playMatch(startMatch(sheet(8), sheet(9), { ...opts, knockout: true }), R("c"));
    const names = {
      player: (id: string) => pool.byId.get(id)?.short ?? "?",
      team: (s: 0 | 1) => (s ? "Away" : "Home"),
    };
    for (const e of r.events) {
      const line = commentary(e, names, r.state.score);
      if (line !== null) expect(line).not.toMatch(/\{|\}|undefined|\?/);
    }
    for (const l of ALL_LINES) expect(l).not.toMatch(/\bFUT\b|ultimate team|\bicons?\b/i);
    const s = shootout(r.state, streams("p"), get).events[0];
    if (s) expect(commentary(s, names, [1, 1])).toMatch(/scores|wrong way|saved|misses/);
  });
});

describe("targeted instructions (Best, Oct 2026): each pays off against a real weakness", () => {
  const n = 500;
  const run = (ins: Partial<Instructions>, tweak: (m: MatchState) => unknown = () => null) => {
    let w = 0;
    let shotsB = 0;
    let starGoals = 0;
    for (let i = 0; i < n; i++) {
      const m = startMatch(sheet(i), sheet(i * 7 + 3), { ...opts, subsPerMatch: 0 as 3 });
      m.teams[0].instructions = { ...DEFAULT_INSTRUCTIONS, ...ins };
      const out = tweak(m);
      const star = typeof out === "string" ? out : null;
      const r = playMatch(m, R(`ins:${i}`));
      if (r.state.score[0] > r.state.score[1]) w++;
      shotsB += r.state.stats.shots[1];
      starGoals += r.events.filter(
        (e) => e.t === "goal" && e.team === 1 && e.player === star,
      ).length;
    }
    return { win: w / n, shotsB: shotsB / n, starGoals: starGoals / n };
  };
  // Their left side (our right) is exhausted.
  const tiredLeft = (m: MatchState) => {
    const t = m.teams[1];
    formation(t.formation).slots.forEach((sl, i) => {
      if (sl.x < 35 && ["LB", "LWB", "CB"].includes(sl.pos)) (t.xi[i] as { fit: number }).fit = 30;
    });
  };
  const best = (m: MatchState) =>
    [...m.teams[1].xi]
      .filter((x) => x.pos !== "GK")
      .sort((a, b) => get(b.id).ovr - get(a.id).ovr)[0]!.id;
  const worstPasser = (m: MatchState) =>
    [...m.teams[1].xi]
      .filter((x) => x.pos !== "GK")
      .sort(
        (a, b) =>
          (get(a.id).stats as { pas: number }).pas - (get(b.id).stats as { pas: number }).pas,
      )[0]!.id;

  it("attacking a spent full-back pays; his fresh side doesn't; no flank is a free win", () => {
    const mixed = run({}, tiredLeft).win;
    expect(run({ flank: "right" }, tiredLeft).win).toBeGreaterThan(mixed + 0.06);
    expect(run({ flank: "left" }, tiredLeft).win).toBeLessThan(mixed + 0.02);
    const plain = run({}).win;
    for (const flank of ["left", "right", "centre"] as const)
      expect(run({ flank }).win).toBeLessThan(plain + 0.07);
  }, 900_000);

  it("man-marking their best player takes most of his goals; pressing a poor passer cuts their shots", () => {
    const free = run({}, best);
    const marked = run({}, (m) => {
      const id = best(m);
      m.teams[0].instructions = { ...DEFAULT_INSTRUCTIONS, mark: id };
      return id;
    });
    expect(marked.starGoals).toBeLessThan(free.starGoals * 0.65);
    const pressed = run({}, (m) => {
      m.teams[0].instructions = { ...DEFAULT_INSTRUCTIONS, press: worstPasser(m) };
    });
    expect(pressed.shotsB).toBeLessThan(free.shotsB * 0.95);
  }, 900_000);
});

describe("tactics matter (Best, Oct 2026: the right answer is worth about 5 rating points)", () => {
  const T = (o: Partial<typeof DEFAULT_TACTICS>) => ({ ...DEFAULT_TACTICS, ...o });
  const winRate = (mine: typeof DEFAULT_TACTICS, theirs: typeof DEFAULT_TACTICS, n = 600) => {
    let w = 0;
    for (let i = 0; i < n; i++) {
      const a = { ...sheet(i), tactics: mine };
      const b = { ...sheet(i * 7 + 3), tactics: theirs };
      if (
        playMatch(startMatch(a, b, opts), R(`tac:${i}`)).state.score.reduce(
          (x, y, k) => (k ? x - y : y),
          0,
        ) > 0
      )
        w++;
    }
    return w / n;
  };
  it("long balls and a press beat a pressing, short-passing side; short passing breaks a deep block", () => {
    const press = T({ defence: "high_press", line: 70, build: "short" });
    expect(winRate(T({ build: "long", defence: "high_press", line: 65 }), press)).toBeGreaterThan(
      winRate(T({}), press) + 0.15,
    );
    const deep = T({ defence: "deep_block", line: 30, build: "counter" });
    expect(winRate(T({ build: "short", defence: "deep_block", line: 35 }), deep)).toBeGreaterThan(
      winRate(T({}), deep) + 0.15,
    );
  }, 300_000);
  it("no setup is a free win against a balanced side", () => {
    const base = winRate(T({}), T({}));
    for (const t of [
      T({ build: "short", defence: "high_press", line: 70 }),
      T({ build: "counter", defence: "deep_block", line: 30 }),
      T({ build: "long" }),
    ])
      expect(winRate(t, T({}))).toBeLessThan(base + 0.1);
  }, 300_000);
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
      const r = playMatch(startMatch(sheet(i), sheet(i * 7 + 3), opts), R(`cal:${i}`));
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
          R(`ko:${i}`),
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
          R(`g:${gap}:${i}`),
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
