import { createHash } from "node:crypto";
import { formulaOvr, OVR_TOLERANCE } from "./ovr.ts";
import {
  datasetSchema,
  isKeeperStats,
  POSITION_GROUP,
  ROLE_POSITIONS,
  type Dataset,
  type Player,
  type Role,
} from "./schema.ts";

// The checks in player-database.md → "Validation script". `mode`:
// "sample" — schema and per-player rules only (the 60-player format proof);
// "batch"  — the same, plus a progress report against the quotas (batches build up to them);
// "release" — everything, quotas and rating distribution included: CI blocks a release otherwise.
export type Mode = "sample" | "batch" | "release";

/** Nations in Africa (ISO 3166-1 alpha-2), for the African quota. */
export const AFRICA = new Set(
  "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW".split(
    " ",
  ),
);

export const QUOTAS = {
  total: 1200,
  nigerian: 120,
  african: 250,
  npfl: 30,
  legends: 150,
  nigerianLegends: 25,
  africanLegends: 50,
  wonderkids: 80,
  nigerianWonderkids: 10,
  keepers: 110,
  perPosition: 40,
  maxNationShare: 0.15,
} as const;

/** OVR bands and their target counts in a 1,200-player set (anchor table), ±25 % allowed. */
export const BANDS: ReadonlyArray<{
  label: string;
  min: number;
  max: number;
  lo: number;
  hi: number;
}> = [
  { label: "89–91", min: 89, max: 91, lo: 4, hi: 8 },
  { label: "85–88", min: 85, max: 88, lo: 40, hi: 60 },
  { label: "80–84", min: 80, max: 84, lo: 180, hi: 240 },
  { label: "74–79", min: 74, max: 79, lo: 330, hi: 400 },
  { label: "65–73", min: 65, max: 73, lo: 280, hi: 350 },
  { label: "≤ 64", min: 0, max: 64, lo: 120, hi: 180 },
];

const BANNED = [
  /\bFUT\b/i,
  /ultimate team/i,
  /\bicons?\b/i,
  /\bTOTY\b/i,
  /\bpacks?\b/i,
  /draft token/i,
];

export type Report = { errors: string[]; warnings: string[]; summary: string[]; hash: string };

/** Content hash of the players (the version must change when this does). */
export const contentHash = (players: Player[]) =>
  createHash("sha256").update(JSON.stringify(players)).digest("hex").slice(0, 16);

const roleFits = (role: Role, p: Player) => {
  const groups = new Set(p.positions.map((x) => POSITION_GROUP[x]));
  const order = ["GK", "DEF", "MID", "ATT"];
  return ROLE_POSITIONS[role].some((rp) => {
    const g = POSITION_GROUP[rp];
    if (p.positions.includes(rp) || groups.has(g)) return true;
    // A neighbouring group (DEF–MID, MID–ATT); never into or out of goal.
    const i = order.indexOf(g);
    return (
      g !== "GK" && [...groups].some((x) => x !== "GK" && Math.abs(order.indexOf(x) - i) === 1)
    );
  });
};

/**
 * Validates a dataset. `today` (YYYY-MM) is the data cut-off: club checks may be at most 8
 * months old, and wonderkids at most 20 that year. `knownHashes`: version → content hash from
 * earlier releases (a changed hash under the same version is an error).
 */
export function validate(
  input: unknown,
  opts: { mode: Mode; today: string; knownHashes?: Record<string, string> },
): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const summary: string[] = [];
  const parsed = datasetSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 50))
      errors.push(`schema: ${issue.path.join(".")}: ${issue.message}`);
    return { errors, warnings, summary, hash: "" };
  }
  const data: Dataset = parsed.data;
  const players = data.players;
  const hash = contentHash(players);
  const known = opts.knownHashes?.[data.version];
  if (known && known !== hash)
    errors.push(`content changed but version ${data.version} didn't: bump it`);

  const [year, month] = opts.today.split("-").map(Number) as [number, number];
  const monthsAgo = (ym: string) => {
    const [y, m] = ym.split("-").map(Number) as [number, number];
    return (year - y) * 12 + (month - m);
  };

  const ids = new Set<string>();
  const nameYears = new Set<string>();
  for (const p of players) {
    const who = p.id;
    if (ids.has(p.id)) errors.push(`${who}: duplicate id`);
    ids.add(p.id);
    const ny = `${p.name}|${p.birthYear ?? "?"}`;
    if (nameYears.has(ny)) errors.push(`${who}: duplicate name + birth year`);
    nameYears.add(ny);
    if (new Set(p.positions).size !== p.positions.length)
      errors.push(`${who}: a position is listed twice`);
    const keeper = p.positions[0] === "GK";
    if (keeper !== isKeeperStats(p.stats)) errors.push(`${who}: GK ⇔ keeper stats`);
    if (keeper && p.positions.length > 1) errors.push(`${who}: a keeper plays only GK`);
    if (!keeper && p.positions.includes("GK")) errors.push(`${who}: GK can't be an alternate`);
    const roles = Object.keys(p.roles) as Role[];
    if (roles.length < 1 || roles.length > 4) errors.push(`${who}: 1–4 roles`);
    for (const r of roles)
      if (!roleFits(r, p)) errors.push(`${who}: role ${r} doesn't fit ${p.positions.join("/")}`);
    // The formula needs the right kind of stats (a mix-up is reported above).
    const f = keeper === isKeeperStats(p.stats) ? formulaOvr(p) : p.ovr;
    if (p.ovr < f - OVR_TOLERANCE.below || p.ovr > f + OVR_TOLERANCE.above)
      errors.push(
        `${who}: ovr ${p.ovr} vs ${f} from the face stats (allowed −${OVR_TOLERANCE.below}…+${OVR_TOLERANCE.above})`,
      );
    if ((p.group === "legend") !== (p.era !== null)) errors.push(`${who}: era iff legend`);
    if ((p.group === "wonderkid") !== (p.potential !== null))
      errors.push(`${who}: potential iff wonderkid`);
    if (p.group === "wonderkid" && (p.birthYear === undefined || p.birthYear < year - 20))
      errors.push(`${who}: wonderkids are 20 or under (born ${p.birthYear ?? "?"})`);
    if (p.group === "legend" && p.club !== null)
      errors.push(`${who}: legends have no current club`);
    if (p.club !== null && p.clubAsOf === null) errors.push(`${who}: club without clubAsOf`);
    if (p.clubAsOf && monthsAgo(p.clubAsOf) > 8)
      (opts.mode === "release" ? errors : warnings).push(
        `${who}: club checked ${p.clubAsOf}, over 8 months ago`,
      );
    if (p.clubAsOf && monthsAgo(p.clubAsOf) < 0)
      errors.push(`${who}: clubAsOf ${p.clubAsOf} is in the future`);
    if (opts.mode !== "sample" && !p.sources?.length) errors.push(`${who}: no sources`);
    const text = [p.name, p.short, p.club ?? "", p.league ?? "", p.basis].join(" ");
    for (const b of BANNED)
      if (b.test(text)) errors.push(`${who}: banned word (${b.source}) in text`);
  }

  // Counts and quotas.
  const by = <K extends string>(key: (p: Player) => K) => {
    const m = new Map<K, number>();
    for (const p of players) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
    return m;
  };
  const ng = players.filter((p) => p.nation === "NG");
  const af = players.filter((p) => AFRICA.has(p.nation));
  const legends = players.filter((p) => p.group === "legend");
  const kids = players.filter((p) => p.group === "wonderkid");
  const npfl = players.filter((p) => p.league === "NPFL");
  const counts = {
    total: players.length,
    nigerian: ng.length,
    african: af.length,
    npfl: npfl.length,
    legends: legends.length,
    nigerianLegends: legends.filter((p) => p.nation === "NG").length,
    africanLegends: legends.filter((p) => AFRICA.has(p.nation)).length,
    wonderkids: kids.length,
    nigerianWonderkids: kids.filter((p) => p.nation === "NG").length,
    keepers: players.filter((p) => p.positions[0] === "GK").length,
  };
  const primary = by((p) => p.positions[0] as string);
  const nations = by((p) => p.nation);
  summary.push(`version ${data.version} · ${counts.total} players · hash ${hash}`);
  summary.push(
    `groups: current ${counts.total - counts.legends - counts.wonderkids}, legends ${counts.legends}, wonderkids ${counts.wonderkids}`,
  );
  summary.push(
    `Nigerian ${counts.nigerian} · African ${counts.african} · NPFL ${counts.npfl} · keepers ${counts.keepers}`,
  );
  summary.push(
    `positions: ${[...primary.entries()]
      .sort()
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
  summary.push(
    `top nations: ${[...nations.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
  const scale = counts.total / QUOTAS.total;
  const current = players.filter((p) => p.group !== "legend");
  const bandCounts = BANDS.map(
    (b) => current.filter((p) => p.ovr >= b.min && p.ovr <= b.max).length,
  );
  summary.push(
    `OVR bands (non-legends): ${BANDS.map((b, i) => `${b.label} ${bandCounts[i]}`).join(", ")}`,
  );

  if (opts.mode === "release") {
    const need = (label: keyof typeof counts, min: number) => {
      if (counts[label] < min) errors.push(`quota: ${label} ${counts[label]} < ${min}`);
    };
    need("total", QUOTAS.total);
    need("nigerian", QUOTAS.nigerian);
    need("african", QUOTAS.african);
    need("npfl", QUOTAS.npfl);
    need("legends", QUOTAS.legends);
    need("nigerianLegends", QUOTAS.nigerianLegends);
    need("africanLegends", QUOTAS.africanLegends);
    need("wonderkids", QUOTAS.wonderkids);
    need("nigerianWonderkids", QUOTAS.nigerianWonderkids);
    need("keepers", QUOTAS.keepers);
    for (const [pos, n] of primary)
      if (pos !== "GK" && n < QUOTAS.perPosition)
        errors.push(`quota: ${pos} ${n} < ${QUOTAS.perPosition}`);
    for (const [nation, n] of nations)
      if (n > QUOTAS.maxNationShare * counts.total)
        errors.push(`quota: ${nation} is over 15 % of the set (${n})`);
    BANDS.forEach((b, i) => {
      const n = bandCounts[i] ?? 0;
      if (n < Math.floor(b.lo * scale * 0.75) || n > Math.ceil(b.hi * scale * 1.25))
        errors.push(`distribution: band ${b.label} has ${n} (target ${b.lo}–${b.hi} ± 25 %)`);
    });
    const sorted = current.map((p) => p.ovr).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    if (median < 72 || median > 76) errors.push(`distribution: median OVR ${median}, want 72–76`);
    const maxCurrent = Math.max(0, ...current.map((p) => p.ovr));
    const maxLegend = Math.max(0, ...legends.map((p) => p.ovr));
    if (maxCurrent > 92) errors.push(`distribution: top current OVR ${maxCurrent} > 92`);
    if (maxLegend > 96) errors.push(`distribution: top legend OVR ${maxLegend} > 96`);
  } else if (opts.mode === "batch") {
    const left = (label: keyof typeof QUOTAS & keyof typeof counts) =>
      `${label} ${counts[label]}/${QUOTAS[label]}`;
    summary.push(
      `quotas so far: ${(["total", "nigerian", "african", "npfl", "legends", "wonderkids", "keepers"] as const).map(left).join(" · ")}`,
    );
  }
  return { errors, warnings, summary, hash };
}
