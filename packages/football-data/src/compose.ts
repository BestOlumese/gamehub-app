import { createHash } from "node:crypto";
import { formulaOvr } from "./ovr.ts";
import type { Player, Position, Role } from "./schema.ts";

// Batches are written as short specs (data/specs/*.json) and composed into full records:
// face stats come from a playing-style template, shifted so the position formula gives exactly
// the rating we chose (minus the reputation adjustment). Hand-set stats override the template.

type Out = { spd: number; fin: number; pas: number; skl: number; def: number; pow: number };
type Gk = { stp: number; rct: number; hdl: number; cmd: number; dst: number; agi: number };

/** Each style's face stats relative to the rating. */
export const STYLES: Record<string, Out | Gk> = {
  st_poacher: { spd: 2, fin: 7, pas: -12, skl: -1, def: -42, pow: 1 },
  st_target: { spd: -7, fin: 4, pas: -12, skl: -6, def: -38, pow: 11 },
  st_runner: { spd: 9, fin: 4, pas: -12, skl: 0, def: -42, pow: -2 },
  st_complete: { spd: 2, fin: 5, pas: -6, skl: 3, def: -40, pow: 3 },
  winger: { spd: 7, fin: -3, pas: -4, skl: 6, def: -42, pow: -14 },
  inside_forward: { spd: 5, fin: 2, pas: -3, skl: 6, def: -42, pow: -14 },
  am: { spd: -2, fin: -1, pas: 6, skl: 6, def: -36, pow: -14 },
  cm_b2b: { spd: -1, fin: -8, pas: 1, skl: -1, def: -2, pow: 5 },
  cm_play: { spd: -4, fin: -8, pas: 4, skl: 3, def: -8, pow: -6 },
  dm: { spd: -8, fin: -26, pas: -2, skl: -8, def: 5, pow: 6 },
  cb: { spd: -6, fin: -45, pas: -12, skl: -18, def: 5, pow: 6 },
  cb_ball: { spd: -5, fin: -45, pas: -4, skl: -12, def: 3, pow: 3 },
  fb: { spd: 6, fin: -35, pas: -3, skl: -6, def: 1, pow: -3 },
  wb: { spd: 7, fin: -30, pas: 0, skl: -2, def: -4, pow: -4 },
  wide_mid: { spd: 5, fin: -10, pas: 0, skl: 2, def: -14, pow: -8 },
  gk: { stp: 2, rct: 2, hdl: -1, cmd: -1, dst: -8, agi: 1 },
  gk_sweeper: { stp: 0, rct: 2, hdl: -2, cmd: 1, dst: -2, agi: 2 },
};

export type Spec = {
  id?: string;
  name: string;
  short: string;
  pos: Position[];
  ovr: number;
  /** Reputation adjustment, −2 … +3 (step 4 of the methodology). */
  rep?: number;
  style: keyof typeof STYLES;
  nation: string;
  club: string | null;
  clubAsOf: string | null;
  league?: string | null;
  group?: Player["group"];
  era?: string | null;
  potential?: Player["potential"];
  foot?: Player["foot"];
  born?: number;
  height?: number;
  roles: Partial<Record<Role, "plus" | "plusplus">>;
  basis: string;
  sources: string[];
  /** Hand-set face stats (otherwise from the style). */
  stats?: Partial<Out & Gk>;
};

export const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** A small, stable per-player wobble (−2…+2) so players of one style don't look identical. */
const wobble = (id: string, key: string) =>
  ((createHash("md5").update(`${id}:${key}`).digest()[0] as number) % 5) - 2;

const clamp = (x: number) => Math.max(1, Math.min(99, Math.round(x)));

export function compose(s: Spec): Player {
  const id = s.id ?? slug(s.name);
  const target = s.ovr - (s.rep ?? 0);
  const base = STYLES[s.style];
  if (!base) throw new Error(`${id}: unknown style ${s.style}`);
  const keys = Object.keys(base) as Array<keyof typeof base>;
  const make = (shift: number) => {
    const out: Record<string, number> = {};
    for (const k of keys) {
      const set = (s.stats as Record<string, number> | undefined)?.[k];
      out[k] =
        set ?? clamp(target + ((base as Record<string, number>)[k] ?? 0) + wobble(id, k) + shift);
    }
    return out as Out | Gk;
  };
  // Shift the template until the formula lands on the target (a few steps at most).
  let shift = 0;
  let stats = make(shift);
  for (let i = 0; i < 20; i++) {
    const got = formulaOvr({ positions: s.pos, stats });
    if (got === target) break;
    shift += target - got;
    stats = make(shift);
  }
  const group = s.group ?? "current";
  const p: Player = {
    id,
    name: s.name,
    short: s.short,
    group,
    positions: s.pos,
    ovr: s.ovr,
    stats,
    nation: s.nation,
    club: s.club,
    clubAsOf: s.clubAsOf,
    ...(s.league !== undefined ? { league: s.league } : {}),
    era: s.era ?? null,
    potential: s.potential ?? null,
    ...(s.foot ? { foot: s.foot } : {}),
    ...(s.born ? { birthYear: s.born } : {}),
    ...(s.height ? { heightCm: s.height } : {}),
    roles: s.roles,
    basis: s.basis,
    sources: s.sources,
  };
  return p;
}
