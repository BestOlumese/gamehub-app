// The matchup meter and your assistant's tips (design decisions, Oct 2026: players felt tactics
// were useless because they couldn't see what was working). Pure: built from the matchup the
// server sends (tactics are public), your own players' stamina, and only the score and minute
// already shown on screen, so a tip never gives the score away.
import {
  GROUP,
  SHOUTS,
  formation,
  type Card,
  type FootballAction,
  type MatchupKey,
  type MatchupPart,
  type Tactics,
  type TeamSheet,
} from "@gamehub/engine/football";

type Side = 0 | 1;

/** How a piece of the matchup reads from your side: [when it helps you, when it hurts you]. */
const OURS: Record<MatchupKey, [string, string]> = {
  short_vs_press: [
    "Our passers are playing through their press",
    "Their press is winning the ball off our short passing",
  ],
  short_vs_deep: [
    "Patient passing is opening their deep block",
    "Their deep block is holding firm",
  ],
  short_open: ["Our passing is keeping the ball", "We're giving the ball away"],
  long_vs_press: [
    "Our long balls go over their press",
    "Their press is coping with our long balls",
  ],
  long_vs_deep: [
    "Our big men are winning the long balls",
    "Their deep block heads our long balls away",
  ],
  long_open: ["Our long balls are finding our strikers", "Our long balls are giving it away"],
  counter_vs_deep: ["We're breaking at them", "There's no space to counter into"],
  counter_space: [
    "Our counters are finding space behind them",
    "Their defenders are quicker than our runners",
  ],
  balanced_vs_shape: ["We're unlocking their shape", "Their shape is frustrating us"],
  pace_vs_line: [
    "Our pace is hurting their high line",
    "Their quick defenders cover the high line",
  ],
};
/** The same pieces when they attack you. */
const THEIRS: Record<MatchupKey, [string, string]> = {
  short_vs_press: ["They're playing through our press", "Our press is winning the ball high up"],
  short_vs_deep: ["They're picking our deep block apart", "Our deep block is holding firm"],
  short_open: ["They're keeping the ball well", "They keep giving the ball away"],
  long_vs_press: [
    "Their long balls are going over our press",
    "Our press is coping with their long balls",
  ],
  long_vs_deep: [
    "Their big men are winning the long balls",
    "Our deep block is heading their long balls away",
  ],
  long_open: ["Their long balls are finding their strikers", "Their long balls are giving it away"],
  counter_vs_deep: ["They're breaking at us", "They have no space to counter into"],
  counter_space: [
    "Their counters are finding space behind us",
    "Our defenders are quicker than their runners",
  ],
  balanced_vs_shape: ["They're unlocking our shape", "Our shape is frustrating them"],
  pace_vs_line: ["Their pace is hurting our high line", "Our quick defenders cover the high line"],
};

export type Meter = {
  /** −1 (they have the edge) … +1 (you do). */
  value: number;
  label: string;
  /** The biggest reason, in plain words. */
  why: string | null;
};

/** Who has the tactical edge right now, and why. */
export function meterOf(matchup: readonly [MatchupPart[], MatchupPart[]], mySide: Side): Meter {
  const mine = matchup[mySide];
  const theirs = matchup[mySide === 0 ? 1 : 0];
  const edge = mine.reduce((a, p) => a + p.v, 0) - theirs.reduce((a, p) => a + p.v, 0);
  // Each piece's effect on you: your attacks as they are, theirs turned round.
  const reasons = [
    ...mine.map((p) => ({ impact: p.v, text: OURS[p.key][p.v >= 0 ? 0 : 1] })),
    ...theirs.map((p) => ({ impact: -p.v, text: THEIRS[p.key][p.v >= 0 ? 0 : 1] })),
  ].filter((r) => Math.abs(r.impact) >= 0.1);
  reasons.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const label =
    Math.abs(edge) < 0.15
      ? "Even"
      : edge > 0
        ? edge > 0.6
          ? "Big edge to you"
          : "Edge to you"
        : edge < -0.6
          ? "Big edge to them"
          : "Edge to them";
  return {
    value: Math.max(-1, Math.min(1, edge / 1.2)),
    label,
    why: reasons[0]?.text ?? null,
  };
}

export type Tip = { key: string; text: string; action: FootballAction | null };

/** Your assistant's most urgent suggestion, with the change that answers it. */
export function tipFor(o: {
  matchup: readonly [MatchupPart[], MatchupPart[]];
  mySide: Side;
  sheet: TeamSheet;
  fit: Record<string, number> | null;
  cards: Record<string, Card>;
  subsLeft: number;
  /** Shown so far (never the live score, which runs ahead). */
  score: readonly [number, number];
  minute: number;
}): Tip | null {
  const mine = o.matchup[o.mySide];
  const theirs = o.matchup[o.mySide === 0 ? 1 : 0];
  const t = o.sheet.tactics;
  const tactics = (patch: Partial<Tactics>): FootballAction => ({
    type: "tactics",
    tactics: { ...t, ...patch },
  });
  const ours = (k: MatchupKey) => mine.find((p) => p.key === k)?.v ?? 0;
  const their = (k: MatchupKey) => theirs.find((p) => p.key === k)?.v ?? 0;

  // 1. A matchup that's hurting you, with its answer.
  if (ours("short_vs_press") <= -0.3)
    return {
      key: "go_long",
      text: "Their press is winning the ball off our short passing. Go long over it.",
      action: tactics({ build: "long" }),
    };
  if (ours("long_vs_deep") <= -0.3)
    return {
      key: "go_short",
      text: "Their deep block is heading our long balls away. Pass it patiently.",
      action: tactics({ build: "short" }),
    };
  if (ours("counter_vs_deep") <= -0.3)
    return {
      key: "keep_ball",
      text: "There's no space to counter into. Keep the ball and pass.",
      action: tactics({ build: "short" }),
    };
  if (their("long_vs_press") >= 0.3)
    return {
      key: "mid_block",
      text: "Their long balls are going over our press. Drop into a mid block.",
      action: tactics({ defence: "mid_block", line: Math.min(t.line, 50) }),
    };
  if (their("short_vs_deep") >= 0.3)
    return {
      key: "press",
      text: "They're picking our deep block apart. Press them high.",
      action: tactics({ defence: "high_press", line: Math.max(t.line, 65) }),
    };
  if (their("counter_space") >= 0.3)
    return {
      key: "drop",
      text: "Their counters are finding space behind us. Drop deeper.",
      action: tactics({
        line: Math.max(25, t.line - 20),
        ...(t.defence === "high_press" ? { defence: "mid_block" as const } : {}),
      }),
    };
  if (their("pace_vs_line") >= 0.2)
    return {
      key: "line",
      text: "Their pace is hurting our high line. Drop the line.",
      action: tactics({ line: 35 }),
    };

  // 2. A player running on empty, and the best man to replace him.
  if (o.fit && o.subsLeft > 0 && o.sheet.bench.length) {
    const slots = formation(o.sheet.formation).slots;
    const spent = o.sheet.xi
      .map((x, i) => ({ id: x.id, i, legs: o.fit?.[x.id] }))
      .filter((x) => x.legs !== undefined && (x.legs as number) < 45)
      .filter((x) => slots[x.i]?.pos !== "GK")
      .sort((a, b) => (a.legs as number) - (b.legs as number))[0];
    if (spent) {
      const pos = slots[spent.i]?.pos;
      const score = (id: string) => {
        const c = o.cards[id];
        if (!c || !pos) return -1;
        const fits = c.positions.includes(pos)
          ? 20
          : GROUP[c.positions[0] ?? pos] === GROUP[pos]
            ? 8
            : 0;
        return c.ovr + fits;
      };
      const best = o.sheet.bench
        .map((id, j) => ({ id, j, s: score(id) }))
        .sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0)
        return {
          key: `sub:${spent.id}`,
          text: `${o.cards[spent.id]?.short ?? "He"} is spent. Bring on ${o.cards[best.id]?.short ?? "a sub"}.`,
          action: { type: "swap", a: { slot: spent.i }, b: { bench: best.j } },
        };
    }
  }

  // 3. The score and the clock (as shown).
  const me = o.score[o.mySide];
  const them = o.score[o.mySide === 0 ? 1 : 0];
  const same = (a: Tactics) => JSON.stringify(a) === JSON.stringify(t);
  if (o.minute >= 70 && me < them && !same(SHOUTS.attack))
    return {
      key: "chase",
      text: "We need a goal. Throw bodies forward.",
      action: { type: "shout", shout: "attack" },
    };
  if (o.minute >= 80 && me > them && !same(SHOUTS.hold))
    return {
      key: "protect",
      text: "Protect the lead. Sit deep and stay compact.",
      action: { type: "shout", shout: "hold" },
    };
  return null;
}
