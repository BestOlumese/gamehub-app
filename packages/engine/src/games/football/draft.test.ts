import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import {
  autoDraft,
  captainOptions,
  LUCK,
  makePool,
  slotOptions,
  subOptions,
  type DraftLuck,
} from "./draft";
import { FORMATIONS, positionPenalty } from "./pitch";
import { chemistry } from "./team";
import { testDataset } from "./test-data";
import type { FootballPlayer } from "./types";

const pool = makePool(testDataset);
const TEAMS = Number(process.env.DRAFT_TEAMS ?? 400);

describe("football draft building blocks", () => {
  it("30 formations of 11 slots, one keeper each, ids 1–30, names unique", () => {
    expect(FORMATIONS).toHaveLength(30);
    expect(FORMATIONS.map((f) => f.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(new Set(FORMATIONS.map((f) => f.name)).size).toBe(30);
    for (const f of FORMATIONS) {
      expect(f.slots).toHaveLength(11);
      expect(f.slots.filter((s) => s.pos === "GK")).toHaveLength(1);
      expect(f.slots[0]?.pos).toBe("GK");
      // Outfield slots sit inside the band the pitch drawing maps (back line 18 → strikers 86).
      for (const s of f.slots.slice(1)) {
        expect(s.y).toBeGreaterThanOrEqual(18);
        expect(s.y).toBeLessThanOrEqual(86);
      }
    }
  });

  it("position penalties: primary 0, alternate 2, same group 6, other group 15, goal 40", () => {
    const p = { positions: ["CM", "DM"] } as Pick<FootballPlayer, "positions">;
    expect([
      positionPenalty(p, "CM"),
      positionPenalty(p, "DM"),
      positionPenalty(p, "AM"),
      positionPenalty(p, "ST"),
      positionPenalty(p, "GK"),
    ]).toEqual([0, 2, 6, 15, 40]);
  });

  it("chemistry: nation 2/5/8, club 2/4/7; Legends count twice by nation; out of position 0", () => {
    const base = {
      group: "current",
      club: null,
      roles: {},
      positions: ["ST"],
    } as unknown as FootballPlayer;
    const ng = (id: string, extra: Partial<FootballPlayer> = {}) =>
      ({ ...base, id, nation: "NG", ...extra }) as FootballPlayer;
    const xi = [
      { player: ng("a", { club: "X" }), pos: "ST" as const, role: "poacher" as const },
      { player: ng("b", { club: "X" }), pos: "ST" as const, role: "poacher" as const },
      { player: ng("c", { group: "legend" }), pos: "ST" as const, role: "poacher" as const },
      { player: ng("d"), pos: "CB" as const, role: "stopper" as const },
    ];
    // NG: 1 + 1 + 2 + 1 = 5 → 2 points; club X: 2 → +1 (capped at 3).
    expect(chemistry(xi)).toEqual([3, 3, 2, 0]);
  });

  it("option sets: 5 distinct, none already picked, ≤ 1 Legend unless jackpot, floor met", () => {
    const L = LUCK.balanced;
    let legendSets = 0;
    for (let i = 0; i < 300; i++) {
      const rng = seededRng(`set-${i}`);
      const picked = new Set(pool.byPos.ST.slice(0, 20).map((p) => p.id));
      const set = slotOptions(rng, pool, "ST", L, picked);
      expect(new Set(set.map((p) => p.id)).size).toBe(5);
      expect(set.some((p) => picked.has(p.id))).toBe(false);
      expect(set.filter((p) => p.group === "legend").length).toBeLessThanOrEqual(2);
      if (set.filter((p) => p.group === "legend").length === 2) legendSets++;
      expect(set.some((p) => p.ovr >= L.floor)).toBe(true);
      const cap = captainOptions(seededRng(`cap-${i}`), pool, 3, L);
      expect(cap.filter((p) => p.ovr >= 86).length).toBeGreaterThanOrEqual(2);
      const sub = subOptions(seededRng(`sub-${i}`), pool, "DEF", L, picked);
      expect(sub.some((p) => p.ovr >= L.floor - 4)).toBe(true);
    }
    expect(legendSets).toBeLessThan(30); // jackpots are rare (2 % of sets)
  });

  it("the same stream gives the same set (identical after an eviction)", () => {
    const a = slotOptions(seededRng("x:draft:1:5"), pool, "CB", LUCK.wild, new Set());
    const b = slotOptions(seededRng("x:draft:1:5"), pool, "CB", LUCK.wild, new Set());
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
  });
});

/** Distribution of auto-drafted team ratings per preset (draft.md → Simulation test and targets). */
function distribution(luck: DraftLuck, n: number) {
  const ratings: number[] = [];
  let withLegend = 0;
  for (let t = 0; t < n; t++) {
    const team = autoDraft((k) => seededRng(`dist:${luck}:${t}:${k}`), pool, luck);
    ratings.push(team.rating);
    const ids = [...Object.values(team.xi), ...team.subs];
    expect(new Set(ids).size).toBe(ids.length);
    if (ids.some((id) => pool.byId.get(id)?.group === "legend")) withLegend++;
  }
  ratings.sort((a, b) => a - b);
  const q = (f: number) => ratings[Math.min(n - 1, Math.floor(f * n))] as number;
  return {
    p10: q(0.1),
    median: q(0.5),
    p90: q(0.9),
    max: ratings[n - 1] as number,
    legends: withLegend / n,
  };
}

describe("draft distribution (targets in draft.md)", () => {
  const targets: Record<
    DraftLuck,
    { p10: number; median: [number, number]; p90: number; max: number; legends: [number, number] }
  > = {
    balanced: { p10: 79, median: [81, 83], p90: 86, max: 89, legends: [0.35, 0.55] },
    wild: { p10: 75, median: [79, 82], p90: 88, max: 91, legends: [0.5, 0.75] },
    elite: { p10: 83, median: [84, 86], p90: 88, max: 90, legends: [0.45, 0.7] },
  };
  for (const luck of ["balanced", "wild", "elite"] as const)
    it(`${luck}: ${TEAMS} auto-drafted teams`, () => {
      const d = distribution(luck, TEAMS);
      console.log(luck, JSON.stringify(d));
      const t = targets[luck];
      expect(d.p10).toBeGreaterThanOrEqual(t.p10);
      expect(d.median).toBeGreaterThanOrEqual(t.median[0]);
      expect(d.median).toBeLessThanOrEqual(t.median[1]);
      expect(d.p90).toBeLessThanOrEqual(t.p90);
      expect(d.max).toBeLessThanOrEqual(t.max);
      expect(d.legends).toBeGreaterThanOrEqual(t.legends[0]);
      expect(d.legends).toBeLessThanOrEqual(t.legends[1]);
    }, 600_000);
});
