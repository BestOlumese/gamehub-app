import { existsSync, readdirSync, readFileSync } from "node:fs";
import { compose, type Spec } from "./compose.ts";
import { readDataset } from "./merge.ts";
import { describe, expect, it } from "vitest";
import { fromCompact, toCompact } from "./compact.ts";
import { formulaOvr } from "./ovr.ts";
import { datasetSchema, type Dataset, type Player } from "./schema.ts";
import { contentHash, validate } from "./validate.ts";

const sample = JSON.parse(
  readFileSync(new URL("../sample.players.json", import.meta.url), "utf8"),
) as Dataset;
const today = "2026-10";
const osimhen = sample.players.find((p) => p.id === "victor-osimhen") as Player;
const one = (p: Partial<Player> & Record<string, unknown>, extra: Player[] = []) => ({
  ...sample,
  players: [{ ...osimhen, ...p }, ...extra],
});
const errorsOf = (data: unknown, mode: "sample" | "batch" | "release" = "sample") =>
  validate(data, { mode, today }).errors.join("\n");

describe("football data validator", () => {
  it("the 60-player sample passes", () => {
    expect(validate(sample, { mode: "sample", today }).errors).toEqual([]);
    expect(sample.players).toHaveLength(60);
  });

  it("each OVR in the sample matches its face stats within the reputation allowance", () => {
    for (const p of sample.players)
      expect(Math.abs(p.ovr - formulaOvr(p)), p.id).toBeLessThanOrEqual(3);
  });

  it("catches duplicates, keeper/stat mix-ups, role misfits and OVR typos", () => {
    expect(errorsOf(one({}, [osimhen]))).toMatch(/duplicate id/);
    expect(errorsOf(one({ positions: ["GK"] }))).toMatch(/GK ⇔ keeper stats/);
    expect(errorsOf(one({ roles: { shot_stopper: "plus" } }))).toMatch(
      /role shot_stopper doesn't fit/,
    );
    expect(errorsOf(one({ ovr: 95 }))).toMatch(/ovr 95 vs/);
    expect(errorsOf(one({ roles: {} }))).toMatch(/1–4 roles/);
  });

  it("group rules: era iff legend, potential iff wonderkid, wonderkid age, legends have no club", () => {
    expect(errorsOf(one({ era: "Prime 2020–2023" }))).toMatch(/era iff legend/);
    expect(errorsOf(one({ group: "wonderkid", potential: "high", birthYear: 1998 }))).toMatch(
      /20 or under/,
    );
    expect(errorsOf(one({ group: "legend", era: "Prime 2020–2024" }))).toMatch(/no current club/);
  });

  it("clubs: a date is needed, and checks older than 8 months block a release", () => {
    expect(errorsOf(one({ clubAsOf: null }))).toMatch(/club without clubAsOf/);
    expect(
      validate(one({ clubAsOf: "2025-12" }), { mode: "batch", today }).warnings.join(),
    ).toMatch(/over 8 months/);
    expect(errorsOf(one({ clubAsOf: "2025-12" }), "release")).toMatch(/over 8 months/);
  });

  it("bans video-game words, and batches need sources", () => {
    expect(errorsOf(one({ basis: "His TOTY season made him an Icon of the league era." }))).toMatch(
      /banned word/,
    );
    expect(errorsOf(one({}), "batch")).toMatch(/no sources/);
    expect(
      errorsOf(one({ sources: ["https://en.wikipedia.org/wiki/Victor_Osimhen"] }), "batch"),
    ).toBe("");
  });

  it("a release checks quotas and the rating spread", () => {
    const r = errorsOf(sample, "release");
    expect(r).toMatch(/quota: total 60 < 1200/);
    expect(r).toMatch(/quota: nigerian/);
  });

  it("the version must change when the content does", () => {
    const hash = contentHash(sample.players);
    expect(
      validate(sample, { mode: "sample", today, knownHashes: { [sample.version]: hash } }).errors,
    ).toEqual([]);
    const changed = one({ ovr: 85 });
    expect(
      validate(changed, {
        mode: "sample",
        today,
        knownHashes: { [sample.version]: hash },
      }).errors.join(),
    ).toMatch(/bump it/);
  });

  it("the compact runtime format round-trips every card field", () => {
    const data = datasetSchema.parse(sample);
    const cards = fromCompact(toCompact(data));
    expect(cards).toHaveLength(60);
    cards.forEach((c, i) => {
      const p = data.players[i] as Player;
      expect([
        c.id,
        c.name,
        c.short,
        c.positions,
        c.ovr,
        c.nation,
        c.club,
        c.group,
        c.era,
        c.potential,
        c.foot,
      ]).toEqual([
        p.id,
        p.name,
        p.short,
        p.positions,
        p.ovr,
        p.nation,
        p.club,
        p.group,
        p.era,
        p.potential,
        p.foot ?? null,
      ]);
      expect(c.roles).toEqual(p.roles);
      expect(c.keeper).toBe(p.positions[0] === "GK");
    });
  });
});

describe("the batches in data/", () => {
  const dir = new URL("../data", import.meta.url).pathname;
  it.skipIf(!existsSync(`${dir}/meta.json`))(
    "pass the batch checks (sources, groups, ratings)",
    () => {
      const hashes = existsSync(`${dir}/hashes.json`)
        ? (JSON.parse(readFileSync(`${dir}/hashes.json`, "utf8")) as Record<string, string>)
        : {};
      const r = validate(readDataset(dir), { mode: "batch", today, knownHashes: hashes });
      expect(r.errors).toEqual([]);
    },
  );
});

describe("specs and batches", () => {
  const dir = new URL("../data", import.meta.url).pathname;
  it("every batch file is exactly what its spec composes to (run `pnpm compose` after editing a spec)", () => {
    if (!existsSync(`${dir}/specs`)) return;
    for (const f of readdirSync(`${dir}/specs`).filter((x) => x.endsWith(".json"))) {
      const spec = JSON.parse(readFileSync(`${dir}/specs/${f}`, "utf8")) as {
        batch: string;
        players: Spec[];
      };
      const batch = JSON.parse(readFileSync(`${dir}/batches/${f}`, "utf8")) as unknown;
      expect(batch, f).toEqual({ batch: spec.batch, players: spec.players.map(compose) });
    }
  });
});
