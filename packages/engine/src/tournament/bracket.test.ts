import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { seededRng } from "../rng";
import type { GameSlug, Rng } from "../types";
import {
  currentTable,
  goThrough,
  isKnockout,
  nextPow2,
  reportTable,
  spread,
  STAGE_GAMES,
  stageFlow,
  startBracket,
  type Bracket,
  type Entrant,
  type StageSpec,
} from "./bracket";

const entrants = (n: number, bots = 0): Entrant[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    userId: i < n - bots ? `u${i}` : null,
    name: `P${i}`,
    avatar: null,
    bot: i < n - bots ? null : "easy",
    status: "in",
    byes: 0,
    lastFinish: null,
    playedByBot: false,
  }));

const stage = (game: GameSlug, tableSize: number, advance: number): StageSpec => ({
  game,
  rules: {},
  tableSize,
  advance,
  bestOf: 1,
});

/** A random valid stage plan for `n` entrants, built stage by stage from a seed. */
function randomPlan(n: number, rng: Rng): StageSpec[] {
  const stages: StageSpec[] = [];
  const multi: GameSlug[] = ["whot", "ludo", "snakes", "rps", "plots", "football"];
  const duel: GameSlug[] = ["chess", "draughts", "tictactoe", "whot", "rps"];
  while (n > 1) {
    const mustEnd = stages.length === 5;
    // A final table of everyone left, when a game allows it.
    const finals = multi.filter((g) => STAGE_GAMES[g].max >= n);
    if ((mustEnd || rng.int(3) === 0) && finals.length) {
      stages.push(stage(finals[rng.int(finals.length)] as GameSlug, n, 1));
      return stages;
    }
    if (mustEnd || n === 2 || rng.int(2) === 0) {
      // Knockout down to a power of two (or the winner).
      const options = [];
      for (let t = 2; t <= nextPow2(n) / 2 && t < n; t *= 2) options.push(t);
      const end = mustEnd || !options.length || rng.int(3) === 0;
      const target = end ? 1 : (options[rng.int(options.length)] as number);
      stages.push(stage(duel[rng.int(duel.length)] as GameSlug, 2, target));
      n = target;
      continue;
    }
    const g = multi[rng.int(multi.length)] as GameSlug;
    const max = Math.min(STAGE_GAMES[g].max, n - 1);
    if (max < 3) continue;
    const T = 3 + rng.int(max - 2);
    const K = 1 + rng.int(T - 1);
    const left = spread(n, T).reduce((s, size) => s + goThrough(size, T, K), 0);
    if (left < 2 || left >= n) continue;
    stages.push(stage(g, T, K));
    n = left;
  }
  return stages;
}

/** A random finishing order for a table, with ties now and then. */
function randomRanking(seats: string[], rng: Rng): string[][] {
  const order = rng.shuffle(seats);
  const out: string[][] = [];
  for (const id of order) {
    const last = out[out.length - 1];
    if (last && rng.int(4) === 0) last.push(id);
    else out.push([id]);
  }
  return out;
}

/** Plays a whole tournament with random results; checks invariants at every step. */
function playOut(n: number, plan: StageSpec[], seed: string) {
  const rng = seededRng(seed);
  const all = entrants(n, rng.int(n));
  const started = startBracket(all, plan, rng);
  if (!started.ok) throw new Error(started.errors.join("; "));
  let b: Bracket = started.step.bracket;
  const flow = stageFlow(n, plan).counts;
  const seenStage = new Set<number>();
  for (let guard = 0; guard < 1000 && !b.placements; guard++) {
    // Nobody is at two unfinished tables.
    const busy = b.tables.filter((t) => t.status !== "done").flatMap((t) => t.seats);
    expect(new Set(busy).size).toBe(busy.length);
    // A new stage's first round: right number of players, fair sizes, byes to the fewest-byes.
    if (!seenStage.has(b.stage)) {
      seenStage.add(b.stage);
      const s = plan[b.stage] as StageSpec;
      const first = b.tables.filter((t) => t.stage === b.stage && t.round === 0);
      expect(first.flatMap((t) => t.seats)).toHaveLength(flow[b.stage] as number);
      if (isKnockout(s)) {
        expect(nextPow2(first.length)).toBe(first.length);
        const byes = first.filter((t) => t.bye).flatMap((t) => t.seats);
        const others = first.filter((t) => !t.bye).flatMap((t) => t.seats);
        const before = (id: string) =>
          b.tables.filter((t) => t.bye && t.stage < b.stage && t.seats.includes(id)).length;
        for (const x of byes)
          for (const y of others) expect(before(x)).toBeLessThanOrEqual(before(y));
      } else {
        const sizes = first.map((t) => t.seats.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        for (const size of sizes) {
          expect(size).toBeLessThanOrEqual(s.tableSize);
          expect(size).toBeGreaterThanOrEqual(STAGE_GAMES[s.game].min);
        }
      }
    }
    const open = b.tables.filter((t) => t.status !== "done");
    const t = open[rng.int(open.length)];
    if (!t) throw new Error("stuck: no open table");
    const step = reportTable(b, t.id, randomRanking(t.seats, rng), rng);
    if (!step) throw new Error(`report refused for ${t.id}`);
    // A second report of the same table changes nothing.
    expect(reportTable(step.bracket, t.id, [t.seats], rng)).toBeNull();
    b = step.bracket;
  }
  if (!b.placements) throw new Error("no champion");
  const places = b.placements;
  expect(places).toHaveLength(n);
  expect(new Set(places.map((p) => p.entrant)).size).toBe(n);
  expect(places.filter((p) => p.place === 1)).toHaveLength(1);
  for (const p of places) expect(p.place).toBeGreaterThanOrEqual(1);
  expect(seenStage.size).toBe(plan.length);
  for (const e of b.entrants) expect(currentTable(b, e.id)).toBeNull();
  return b;
}

describe("stage plans", () => {
  it("projects the flow and explains impossible plans", () => {
    expect(
      stageFlow(32, [
        stage("whot", 4, 2),
        stage("ludo", 4, 2),
        stage("chess", 2, 2),
        stage("football", 2, 1),
      ]).counts,
    ).toEqual([32, 16, 8, 2, 1]);
    // 13 at Whot tables of 4, top 2: tables 4, 3, 3, 3 → 8 go through.
    expect(spread(13, 4)).toEqual([4, 3, 3, 3]);
    expect(
      stageFlow(13, [stage("whot", 4, 2), stage("ludo", 4, 2), stage("rps", 2, 1)]).counts,
    ).toEqual([13, 8, 4, 1]);
    // 9 at tables of 4 → 3, 3, 3 rather than 4, 4, 1.
    expect(spread(9, 4)).toEqual([3, 3, 3]);
    const bad = (n: number, stages: StageSpec[]) => stageFlow(n, stages).errors;
    expect(bad(8, [stage("ludo", 6, 2), stage("chess", 2, 1)])[0]).toMatch(/Ludo tables are 2–4/);
    expect(bad(8, [stage("whot", 4, 4), stage("chess", 2, 1)])[0]).toMatch(/1–3 can go through/);
    expect(bad(8, [stage("whot", 4, 2)])[0]).toMatch(/final is one table of 8/);
    expect(bad(8, [stage("chess", 2, 3), stage("whot", 3, 1)])[0]).toMatch(/2, 4, 8 or 16/);
    expect(bad(8, [stage("chess", 2, 4)])).toEqual([]); // the last stage always ends at one
    expect(bad(3, [stage("whot", 3, 1)])[0]).toMatch(/4–32 players/);
    expect(bad(8, [])[0]).toMatch(/at least one stage/);
  });

  it("a knockout of 6: two byes, then a round of four", () => {
    const r = startBracket(entrants(6), [stage("chess", 2, 1)], seededRng("ko6"));
    if (!r.ok) throw new Error(r.errors.join());
    const first = r.step.bracket.tables;
    expect(first).toHaveLength(4);
    expect(first.filter((t) => t.bye)).toHaveLength(2);
    expect(r.step.created).toHaveLength(2);
    // Byes are spread out: they don't meet each other in round two.
    const byeIdx = first.filter((t) => t.bye).map((t) => t.index);
    expect(Math.floor((byeIdx[0] as number) / 2)).not.toBe(Math.floor((byeIdx[1] as number) / 2));
  });

  it("byes go to people before bots, and to whoever had fewest", () => {
    // 5 left for a knockout: 3 byes. Two bots among them.
    const all = entrants(5, 2);
    all[0] = { ...(all[0] as Entrant), byes: 1 };
    const r = startBracket(all, [stage("chess", 2, 1)], seededRng("byes"));
    if (!r.ok) throw new Error(r.errors.join());
    const byes = r.step.bracket.tables.filter((t) => t.bye).flatMap((t) => t.seats);
    // startBracket resets byes, so e0 counts as 0 again: the 3 people get them.
    expect(byes.sort()).toEqual(["e0", "e1", "e2"]);
  });

  it("a tie across the cut is settled by a coin toss, and logged", () => {
    const r = startBracket(
      entrants(8),
      [stage("whot", 4, 2), stage("whot", 4, 1)],
      seededRng("tie"),
    );
    if (!r.ok) throw new Error(r.errors.join());
    const t = r.step.bracket.tables[0];
    if (!t) throw new Error("no table");
    const [a, b, c, d] = t.seats as [string, string, string, string];
    const step = reportTable(r.step.bracket, t.id, [[a], [b, c], [d]], seededRng("coin"));
    const done = step?.bracket.tables[0];
    expect(done?.coin).toBe(true);
    expect(done?.through).toHaveLength(2);
    expect(done?.through?.[0]).toBe(a);
    // A wrong table list is refused.
    expect(reportTable(r.step.bracket, t.id, [[a], [b]], seededRng("x"))).toBeNull();
  });
});

describe("whole tournaments with random results", () => {
  test.prop([fc.integer({ min: 4, max: 32 }), fc.string({ minLength: 1, maxLength: 8 })], {
    numRuns: 1000,
  })("every plan finishes with one champion and a place for everyone", (n, seed) => {
    const plan = randomPlan(n, seededRng(`plan:${seed}:${n}`));
    expect(stageFlow(n, plan).errors).toEqual([]);
    playOut(n, plan, `play:${seed}`);
  });

  it("the spec's example: 32 → Whot → Ludo → chess knockout → football final", () => {
    const plan = [
      stage("whot", 4, 2),
      stage("ludo", 4, 2),
      stage("chess", 2, 2),
      stage("football", 2, 1),
    ];
    const b = playOut(32, plan, "spec");
    // Places: champion, runner-up, then shared bands.
    const counts = new Map<number, number>();
    for (const p of b.placements ?? []) counts.set(p.place, (counts.get(p.place) ?? 0) + 1);
    expect(counts.get(1)).toBe(1);
    expect(counts.get(2)).toBe(1);
    expect((b.placements ?? []).filter((p) => p.outAtStage === null)).toHaveLength(2);
  });
});
