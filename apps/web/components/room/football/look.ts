// Small presentation helpers for Football Draft (no React): flags, tiers, initials, stat labels.
import { isKeeperStats, tierOf, type Card } from "@gamehub/engine/football";

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
