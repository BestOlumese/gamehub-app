// Monte Carlo balance check (docs/games/property.md → "Tests and balance simulation"):
// Medium bots play many games; the report says whether each band holds.
import type { SeatIndex } from "../../types";
import { GROUP_SPACES, GROUPS, type Group } from "./board";
import { activeSeats, netWorth } from "./core";
import { plotsNaija, type PlotsRules } from "./rules";
import { simulate } from "./sim";

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? (a[Math.floor(a.length / 2)] as number) : NaN;
};
const pct = (x: number) => `${(100 * x).toFixed(1)} %`;

export type BandResult = { band: string; value: string; pass: boolean };

export function balanceReport(games: number, players: number, rules: PlotsRules = plotsNaija) {
  const classic: PlotsRules = { ...rules, mode: "classic", classicCapHours: 3 };
  const rounds: number[] = [];
  let bankruptEnds = 0;
  let firstWins = 0;
  const groupGames: Record<Group, number> = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<
    Group,
    number
  >;
  const groupWins = { ...groupGames };
  const supply: number[] = [];
  const supply15: number[] = [];
  const worth30: number[] = [];
  for (let g = 0; g < games; g++) {
    let cashAt30: number | null = null;
    let cashAt15: number | null = null;
    let worthAt30: number | null = null;
    // Who completed each group first.
    const firstFull = new Map<Group, SeatIndex>();
    const { state } = simulate(classic, players, `bal-${players}-${g}`, {
      stepMs: 50,
      maxActions: 200_000,
      stopAfterTurns: 200 * players,
      onState: (s) => {
        if (cashAt15 === null && s.turns > 15 * players)
          cashAt15 = s.cash.reduce((a, b) => a + b, 0);
        if (cashAt30 === null && s.turns > 30 * players) {
          cashAt30 = s.cash.reduce((a, b) => a + b, 0);
          worthAt30 = activeSeats(s).reduce((a, x) => a + netWorth(s, x, rules), 0);
        }
        for (const grp of GROUPS) {
          if (firstFull.has(grp)) continue;
          const o = s.owner[GROUP_SPACES[grp][0] as number];
          if (o !== null && o !== undefined && GROUP_SPACES[grp].every((i) => s.owner[i] === o))
            firstFull.set(grp, o);
        }
      },
    });
    const start = rules.startCash * players;
    if (cashAt30 !== null) supply.push(cashAt30 / start);
    if (cashAt15 !== null) supply15.push(cashAt15 / start);
    if (worthAt30 !== null) worth30.push(worthAt30 / start);
    rounds.push(state.turns / players);
    if (state.places && state.out.length === players - 1) bankruptEnds++;
    // Unfinished (200 rounds): the richest player counts as the winner.
    const winner = (state.places?.[0]?.[0] ??
      activeSeats(state).sort(
        (a, b) => netWorth(state, b, rules) - netWorth(state, a, rules),
      )[0]) as SeatIndex;
    if (winner === state.order[0]) firstWins++;
    for (const [grp, o] of firstFull) {
      groupGames[grp]++;
      if (o === winner) groupWins[grp]++;
    }
  }

  // Timed 45-minute equivalent: the turns a 45-minute game has (docs/games/property.md cost
  // estimate: ~70 turns with 4 players, ~100 with 8), then net worth.
  const timedTurns = Math.round(44 + 7 * players);
  const spreads: boolean[] = [];
  for (let g = 0; g < Math.min(games, 2000); g++) {
    const { state } = simulate(classic, players, `timed-${players}-${g}`, {
      stepMs: 50,
      stopAfterTurns: timedTurns,
    });
    const worths = activeSeats(state).map((x) => netWorth(state, x, rules));
    if (worths.length < 2) continue;
    spreads.push(Math.max(...worths) <= 3 * median(worths));
  }

  const within150 = rounds.filter((r) => r <= 150).length / games;
  const rates = GROUPS.filter((g) => groupGames[g] >= 20).map((g) => groupWins[g] / groupGames[g]);
  const groupRatio = rates.length ? Math.max(...rates) / Math.min(...rates) : NaN;
  const firstRate = firstWins / games;
  const supplyMid = median(supply);
  const lead = spreads.filter(Boolean).length / Math.max(1, spreads.length);
  const four = players === 4;
  const bands: BandResult[] = [
    // Length and the timed spread are defined for 4 players; bigger rooms play timed by default.
    four
      ? {
          band: "Classic median 30–60 rounds",
          value: `${median(rounds).toFixed(1)}`,
          pass: median(rounds) >= 30 && median(rounds) <= 60,
        }
      : { band: "Classic median rounds (info)", value: `${median(rounds).toFixed(1)}`, pass: true },
    ...(four
      ? [
          {
            band: "≥ 95 % end by bankruptcy within 150 rounds",
            value: pct(Math.min(within150, bankruptEnds / games)),
            pass: within150 >= 0.95 && bankruptEnds / games >= 0.95,
          },
        ]
      : []),
    {
      band: `Winner ≤ 3 × median net worth after a 45-min game (${timedTurns} turns)${four ? " in ≥ 80 %" : " (info)"}`,
      value: pct(lead),
      pass: !four || lead >= 0.8,
    },
    {
      band: "No group's win rate over 2 × another's",
      value: groupRatio.toFixed(2),
      pass: groupRatio <= 2,
    },
    // Kept as information: going first is a small edge in this kind of game, and rooms pick the
    // first player at random by default (Best, Oct 2026).
    {
      band: `First seat's win rate (fair: ${pct(1 / players)}) (info)`,
      value: pct(firstRate),
      pass: true,
    },
    // Inflation check: all money in play (cash, plots, buildings). Cash alone falls as people build.
    {
      band: "Money in play after 30 rounds 0.5×–3× the start",
      value: `${median(worth30).toFixed(2)}×`,
      pass: !worth30.length || (median(worth30) >= 0.5 && median(worth30) <= 3),
    },
    {
      band: "Cash after 15 / 30 rounds (info)",
      value: `${median(supply15).toFixed(2)}× / ${supplyMid.toFixed(2)}×`,
      pass: true,
    },
  ];
  const groups = GROUPS.map(
    (g) => `${g} ${groupGames[g] ? pct(groupWins[g] / groupGames[g]) : "–"} (${groupGames[g]})`,
  ).join(", ");
  return { players, games, bands, groups, medianRounds: median(rounds) };
}
