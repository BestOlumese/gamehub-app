// Small presentation helpers for Football Draft (no React): flags, tiers, initials, stat labels.
import {
  formation,
  FORMATIONS,
  isKeeperStats,
  tierOf,
  UNIT_WEIGHTS,
  type Card,
} from "@gamehub/engine/football";

/** Flag emoji for an ISO 3166-1 alpha-2 code, or a UK nation ("GB-ENG"). */
export function flagOf(code: string): string {
  const sub: Record<string, string> = { "GB-ENG": "gbeng", "GB-SCT": "gbsct", "GB-WLS": "gbwls" };
  const tag = sub[code];
  if (tag)
    return `\u{1F3F4}${[...tag].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join("")}\u{E007F}`;
  if (code === "GB-NIR") return "🇬🇧";
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Tier band colours (design system → Football Draft): Elite, Star, Strong, Solid, Squad. */
export const TIER_COLOUR = ["#1A1C20", "#0E7A4E", "#2F6FD6", "#8A8E94", "#C9BFAF"] as const;
export const TIER_NAME = ["Elite", "Star", "Strong", "Solid", "Squad"] as const;
export const tierColour = (ovr: number) => TIER_COLOUR[tierOf(ovr)];

export const initials = (name: string) =>
  name
    .replace(/'[^']*'/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** The six face stats as [label, value] pairs (keepers have their own). */
export function statRows(c: Pick<Card, "stats">): Array<[string, number]> {
  const s = c.stats;
  return isKeeperStats(s)
    ? [
        ["STP", s.stp],
        ["RCT", s.rct],
        ["HDL", s.hdl],
        ["CMD", s.cmd],
        ["DST", s.dst],
        ["AGI", s.agi],
      ]
    : [
        ["SPD", s.spd],
        ["FIN", s.fin],
        ["PAS", s.pas],
        ["SKL", s.skl],
        ["DEF", s.def],
        ["POW", s.pow],
      ];
}

/** Role ids as words ("inside_forward" → "Inside forward"). */
export const roleName = (r: string) => (r.charAt(0).toUpperCase() + r.slice(1)).replace(/_/g, " ");

/** How a formation leans, in plain words the name doesn't already say: "Attacking · wingers, a playmaker". */
export function formationLean(id: number): string {
  const units = (f: number) =>
    [0, 1, 2].map((k) =>
      formation(f).slots.reduce((sum, s) => sum + (UNIT_WEIGHTS[s.pos][k] ?? 0), 0),
    );
  const mine = units(id);
  const mean = [0, 1, 2].map(
    (k) => FORMATIONS.reduce((sum, f) => sum + (units(f.id)[k] ?? 0), 0) / FORMATIONS.length,
  );
  const [d, m, a] = mine.map((v, k) => v - (mean[k] ?? 0)) as [number, number, number];
  const top = Math.max(d, m, a);
  const lean =
    top < 0.25 ? "Balanced" : top === a ? "Attacking" : top === d ? "Defensive" : "Midfield-heavy";
  const count = (...p: string[]) => formation(id).slots.filter((s) => p.includes(s.pos)).length;
  const width = count("RW", "LW")
    ? "wingers"
    : count("RWB", "LWB")
      ? "wing-backs"
      : count("RM", "LM")
        ? "wide midfielders"
        : "narrow";
  const n = ["", "a", "two", "three"];
  const centre = count("AM")
    ? `${n[count("AM")]} playmaker${count("AM") > 1 ? "s" : ""}`
    : count("DM")
      ? `${n[count("DM")]} holding midfielder${count("DM") > 1 ? "s" : ""}`
      : "a flat midfield";
  return `${lean} · ${width}, ${centre}`;
}

/** The two sides' colours on the live pitch, the scoreboard and the report (home, away). */
export const TEAM_COLOURS: readonly [string, string] = ["#2F6FD6", "#E07A2E"];
