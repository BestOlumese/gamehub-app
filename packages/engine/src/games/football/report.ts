// Player ratings, momentum and "why you won or lost" (decided with Best, Oct 2026). Pure: built
// from a match's events, so phones can rate what they've been shown so far, and the full-time
// report reads the whole log once the match is over.
import type { ChanceKind, MatchEvent, Side, TeamSheet } from "./match";

/** Rating changes from events alone (no starting value, no result): add them to a base. */
export function ratingDeltas(events: readonly MatchEvent[]): Record<string, number> {
  const d: Record<string, number> = {};
  const add = (id: string | undefined, v: number) => {
    if (id) d[id] = (d[id] ?? 0) + v;
  };
  for (const e of events) {
    switch (e.t) {
      case "goal":
        add(e.player, 1);
        add(e.assist, 0.6);
        break;
      case "shot":
        if (e.result === "saved") add(e.player, 0.15);
        else if (e.result === "post") add(e.player, 0.05);
        else if (e.result !== "goal") add(e.player, -0.05);
        break;
      case "chance":
        add(e.player, 0.05);
        add(e.assist, 0.1);
        break;
      case "save":
        add(e.keeper, 0.35);
        break;
      case "offside":
        add(e.player, -0.1);
        break;
      case "foul":
        if (e.card === "yellow") add(e.player, -0.3);
        else if (e.card) add(e.player, -1.2);
        break;
    }
  }
  return d;
}

export type PlayerRating = { id: string; side: Side; rating: number; sub: boolean };

/**
 * Full-time ratings: 6.4 to start (6.2 for a sub), the event changes, the keeper's goals
 * conceded, a clean sheet for keeper and defenders, and the result. 3–10, one decimal.
 */
export function playerRatings(
  events: readonly MatchEvent[],
  teams: readonly [TeamSheet, TeamSheet],
  defenders: readonly [readonly string[], readonly string[]],
): PlayerRating[] {
  const d = ratingDeltas(events);
  const score: [number, number] = [0, 0];
  for (const e of events) if (e.t === "goal") score[e.team]++;
  const out: PlayerRating[] = [];
  ([0, 1] as const).forEach((side) => {
    const other = side === 0 ? 1 : 0;
    const subsOn = events.flatMap((e) => (e.t === "sub" && e.team === side ? [e.on] : []));
    const ids = [...teams[side].xi.map((x) => x.id), ...subsOn];
    const keeper = teams[side].xi[0]?.id;
    const result = score[side] > score[other] ? 0.2 : score[side] < score[other] ? -0.2 : 0;
    for (const id of ids) {
      const sub = subsOn.includes(id);
      let r = (sub ? 6.2 : 6.4) + (d[id] ?? 0) + result;
      if (id === keeper) r += score[other] === 0 ? 0.6 : -0.25 * score[other];
      if (score[other] === 0 && defenders[side].includes(id)) r += 0.3;
      out.push({ id, side, rating: Math.round(Math.min(10, Math.max(3, r)) * 10) / 10, sub });
    }
  });
  return out;
}

/** Who was on top, five minutes at a time (−1 the away side … +1 the home side), and the goals. */
export function momentum(events: readonly MatchEvent[]): {
  buckets: number[];
  goals: Array<{ bucket: number; side: Side }>;
} {
  const raw: number[] = [];
  const goals: Array<{ bucket: number; side: Side }> = [];
  for (const e of events) {
    if (!("team" in e) || e.t === "pen") continue;
    const b = Math.min(23, Math.floor(Math.max(0, e.m - 1) / 5));
    const sign = e.team === 0 ? 1 : -1;
    const w =
      e.t === "ball"
        ? e.zone === 2
          ? 0.4
          : e.zone === 1
            ? 0.1
            : 0
        : e.t === "shot"
          ? 0.6
          : e.t === "chance" || e.t === "corner"
            ? 0.3
            : 0;
    raw[b] = (raw[b] ?? 0) + sign * w;
    if (e.t === "goal") goals.push({ bucket: b, side: e.team });
  }
  const n = Math.max(1, raw.length);
  const filled = Array.from({ length: n }, (_, i) => raw[i] ?? 0);
  const top = Math.max(0.01, ...filled.map(Math.abs));
  return { buckets: filled.map((v) => v / top), goals };
}

const KIND: Record<ChanceKind, string> = {
  build_up: "patient build-up",
  through_ball: "balls in behind",
  cross: "crosses",
  long_shot: "long shots",
  free_kick: "free kicks",
  corner: "corners",
  direct: "long balls",
  counter: "counter-attacks",
};

/** Up to four plain reasons, from `side`'s point of view. */
export function whyLines(
  events: readonly MatchEvent[],
  side: Side,
  /** The match's exact xG totals, when known (shots carry rounded values). */
  xgTotals?: readonly [number, number],
): string[] {
  const other = side === 0 ? 1 : 0;
  const shots = [0, 0];
  const xg = [0, 0];
  const goals = [0, 0];
  const kinds: Partial<Record<ChanceKind, number>> = {};
  let chances = 0;
  for (const e of events) {
    if (e.t === "shot") {
      shots[e.team] = (shots[e.team] ?? 0) + 1;
      xg[e.team] = (xg[e.team] ?? 0) + e.xg;
    }
    if (e.t === "goal") goals[e.team] = (goals[e.team] ?? 0) + 1;
    if (e.t === "chance" && e.team === side) {
      kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
      chances++;
    }
  }
  const [mx, tx] = xgTotals
    ? [xgTotals[side], xgTotals[other]]
    : [xg[side] as number, xg[other] as number];
  const f = (x: number) => x.toFixed(1);
  const lines: string[] = [];
  // 1. Chances.
  if (mx > tx + 0.4)
    lines.push(
      `You made the better chances: ${shots[side]} shots to ${shots[other]}, xG ${f(mx)}–${f(tx)}.`,
    );
  else if (tx > mx + 0.4)
    lines.push(
      `They made the better chances: ${shots[other]} shots to ${shots[side]}, xG ${f(tx)}–${f(mx)}.`,
    );
  else lines.push(`Little between the sides: xG ${f(mx)}–${f(tx)}.`);
  // 2. Finishing.
  const mg = goals[side] as number;
  const tg = goals[other] as number;
  if (mg >= mx + 1) lines.push(`Clinical: ${mg} goals from ${f(mx)} xG.`);
  else if (mg <= mx - 1) lines.push(`Wasteful: ${mg} from ${f(mx)} xG.`);
  else if (tg >= tx + 1) lines.push(`They scored ${tg} from ${f(tx)} xG: little you could do.`);
  // 3. Turning points: your change followed by goals, a red card.
  const changes = events.filter((e) => (e.t === "tactics" || e.t === "sub") && e.team === side);
  for (const c of changes) {
    const after = events.filter(
      (e) => e.t === "goal" && e.team === side && e.m > c.m && e.m <= c.m + 15,
    ).length;
    if (after >= 1) {
      lines.push(
        `Your change at ${c.m}' turned it: ${after} goal${after > 1 ? "s" : ""} in the next 15 minutes.`,
      );
      break;
    }
  }
  const red = events.find(
    (e) => e.t === "foul" && (e.card === "red" || e.card === "second_yellow"),
  );
  if (red && red.t === "foul")
    lines.push(
      red.team === side
        ? `You were down to ten from ${red.m}'.`
        : `They were down to ten from ${red.m}'.`,
    );
  // 4. Where your chances came from.
  const top = (Object.entries(kinds) as Array<[ChanceKind, number]>).sort((a, b) => b[1] - a[1])[0];
  if (top && chances >= 3 && top[1] / chances >= 0.4)
    lines.push(`Most of your chances came from ${KIND[top[0]]} (${top[1]} of ${chances}).`);
  return lines.slice(0, 4);
}
