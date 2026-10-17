// Words for the bracket: places, round names, who's who (client-safe, no I/O).
import type { EntrantPublic, TablePublic, TournamentPublic } from "@gamehub/protocol";
import { isKnockout, STAGE_GAMES } from "./plan";

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "1st", or "=5th" when shared. */
export function placeLabel(place: number, shared: boolean): string {
  return `${shared ? "=" : ""}${ordinal(place)}`;
}

/** "Final", "Semi-finals"… for a knockout round with `tables` matches. */
export function roundName(tables: number): string {
  if (tables <= 1) return "Final";
  if (tables <= 2) return "Semi-finals";
  if (tables <= 4) return "Quarter-finals";
  return `Round of ${tables * 2}`;
}

export const nameOf = (e: EntrantPublic | undefined) =>
  !e ? "?" : e.userId ? `@${e.name}` : e.name;

export function stageTitle(t: TournamentPublic, stage: number): string {
  const s = t.config.stages[stage];
  return s ? STAGE_GAMES[s.game].name : `Stage ${stage + 1}`;
}

/** Your situation in one line or two, for the card at the top. */
export function statusOf(
  t: TournamentPublic,
  you: string | "spectator",
): { title: string; detail: string; table: TablePublic | null } {
  const me = t.entrants.find((e) => e.id === you);
  if (t.phase === "finished") {
    const champ = t.entrants.find(
      (e) => e.id === t.placements?.find((p) => p.place === 1)?.entrant,
    );
    const mine = t.placements?.find((p) => p.entrant === you);
    if (mine?.place === 1)
      return { title: "You won the tournament", detail: "Champion.", table: null };
    const shared = !!mine && (t.placements?.filter((p) => p.place === mine.place).length ?? 0) > 1;
    return {
      title: `${nameOf(champ)} won`,
      detail: mine ? `You finished ${placeLabel(mine.place, shared)}.` : "The tournament is over.",
      table: null,
    };
  }
  if (!me) return { title: "Watching", detail: "You're not in this tournament.", table: null };
  const open = t.tables.find((x) => x.status !== "done" && x.seats.includes(me.id)) ?? null;
  const game = stageTitle(t, t.stage);
  if (me.status === "left")
    return { title: "You left", detail: "A bot is playing your games.", table: null };
  if (me.status === "out") {
    const outAt = t.tables.filter((x) => x.seats.includes(me.id)).at(-1);
    return {
      title: "Knocked out",
      detail: outAt
        ? `Out in stage ${outAt.stage + 1} (${stageTitle(t, outAt.stage)}). You can watch the rest.`
        : "You can watch the rest.",
      table: null,
    };
  }
  if (open)
    return { title: "You're playing", detail: `${game} · your table is ready.`, table: open };
  const bye = t.tables.find(
    (x) => x.bye && x.stage === t.stage && x.round === t.round && x.seats.includes(me.id),
  );
  if (bye) return { title: "You have a bye", detail: "Straight through this round.", table: null };
  return {
    title: "You're through",
    detail: "Waiting for the other tables to finish.",
    table: null,
  };
}

export { isKnockout };
