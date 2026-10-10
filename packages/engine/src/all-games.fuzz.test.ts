import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { chess } from "./games/chess";
import { draughts, draughtsEnglish } from "./games/draughts";
import { ludo } from "./games/ludo";
import { plots } from "./games/plots";
import { rps } from "./games/rps";
import { snakes } from "./games/snakes";
import { tictactoe } from "./games/tictactoe";
import { whot } from "./games/whot";
import { seededRng } from "./rng";
import type { GameDefinition, RuleConfigBase, SeatIndex } from "./types";

type Any = GameDefinition<unknown, unknown, unknown, RuleConfigBase>;
const T0 = 1_000_000;
/** Deep games (rare jumps and timeouts) or shallow ones (lots of both), by env. */
const DEEP = !!process.env.ALL_FUZZ_DEEP;
const JUMP_ONE_IN = DEEP ? 60 : 3;
const TIMEOUT_TENTHS = DEEP ? 0.3 : 2;
const stats: Record<string, { games: number; steps: number; over: number }> = {};

/**
 * Every game, played the way the room plays it: random legal actions from anyone (not just the
 * player on turn), time jumping ahead, the room's timeout action when a deadline passes, bots
 * answering what's asked of them. Nothing may throw, nobody may get stuck, every timeout the
 * room would apply must be accepted, and a finished game ranks every seat once.
 */
function fuzz(def: Any, rules: RuleConfigBase, players: number, seed: string, maxSteps: number) {
  const rng = seededRng(seed);
  let now = T0;
  let s = def.setup(players, { rng, rules, now }, rng.int(players));
  let step = 0;
  for (; step < maxSteps && !def.isOver(s); step++) {
    // Mostly a few seconds; now and then a long wait (a deadline passes).
    now += rng.int(JUMP_ONE_IN) === 0 ? 1 + rng.int(200_000) : 1 + rng.int(2000);
    const current = def.currentSeats(s);
    const auto = def.autoAdvance(s, rules);
    if (auto) {
      const res = def.apply(s, { seat: auto.seat, action: auto.action }, { rng, rules, now });
      if (!res.ok) throw new Error(`autoAdvance refused: ${res.error}`);
      s = res.state;
      continue;
    }
    if (!current.length) throw new Error(`nobody to act and no auto-advance (step ${step})`);
    const r = rng.int(1000) / 100;
    if (r < TIMEOUT_TENTHS) {
      // A deadline passes: the room applies the timeout action for a seat that's due.
      const seat = current[rng.int(current.length)] as SeatIndex;
      const due = def.turnDeadline?.(s, seat, rules) ?? now;
      if (due === null) continue;
      now = Math.max(now, due);
      const action = def.timeoutAction(s, seat, rules, rng);
      const res = def.apply(s, { seat, action }, { rng, rules, now });
      if (!res.ok)
        throw new Error(`timeout ${JSON.stringify(action)} for ${seat} refused: ${res.error}`);
      s = res.state;
    } else {
      const seat = r < 4 ? rng.int(players) : (current[rng.int(current.length)] as SeatIndex);
      const legal = def.legalActions(s, seat, rules);
      if (current.includes(seat) && !legal.length && !def.turnDeadline)
        throw new Error(`seat ${seat} is waited on but has no legal action (step ${step})`);
      if (!legal.length) continue;
      // People rarely quit: resigning, aborting and going bankrupt only now and then.
      const quits = new Set(["resign", "abort", "declare_bankruptcy"]);
      const keepPlaying = legal.filter((a) => !quits.has((a as { type: string }).type));
      const pool = keepPlaying.length && rng.int(20) !== 0 ? keepPlaying : legal;
      const action = pool[rng.int(pool.length)];
      const res = def.apply(s, { seat, action }, { rng, rules, now });
      // Listed as legal means accepted (a clock may run out between, for clocked games).
      if (!res.ok && !def.turnDeadline)
        throw new Error(`legal ${JSON.stringify(action)} for ${seat} refused: ${res.error}`);
      if (res.ok) s = res.state;
    }
    // Bots answer what was asked of them (takebacks, draws, trade offers).
    for (let i = 0; i < players && !def.isOver(s); i++) {
      if (def.currentSeats(s).includes(i)) continue;
      const reply = def.botReply?.(s, i, rules);
      if (!reply) continue;
      const res = def.apply(s, { seat: i, action: reply }, { rng, rules, now });
      if (res.ok) s = res.state;
    }
    def.view(s, "spectator");
  }
  const st = (stats[def.slug] ??= { games: 0, steps: 0, over: 0 });
  st.games++;
  st.steps += step;
  if (def.isOver(s)) st.over++;
  if (def.isOver(s) && !def.aborted?.(s)) {
    const ranked = def.ranking(s).flat();
    if (ranked.length && new Set(ranked).size !== ranked.length)
      throw new Error(`a seat is ranked twice: ${JSON.stringify(def.ranking(s))}`);
  }
  return s;
}

const games: Array<[string, Any, RuleConfigBase, number, number, number]> = [
  ["tic-tac-toe", tictactoe as unknown as Any, tictactoe.presets.naija, 2, 2, 400],
  ["rock paper scissors", rps as unknown as Any, rps.presets.naija, 2, 8, 600],
  ["whot", whot as unknown as Any, whot.presets.naija, 2, 8, 1500],
  [
    "whot, decking + block",
    whot as unknown as Any,
    { ...whot.presets.naija, decking: "chain", whotBlocksPick: true } as RuleConfigBase,
    2,
    8,
    1500,
  ],
  ["ludo", ludo as unknown as Any, ludo.presets.naija, 2, 4, 1500],
  ["snakes", snakes as unknown as Any, snakes.presets.naija, 2, 8, 1500],
  ["chess", chess as unknown as Any, chess.presets.naija, 2, 2, 300],
  ["draughts", draughts as unknown as Any, draughts.presets.naija, 2, 2, 600],
  ["english checkers", draughts as unknown as Any, draughtsEnglish, 2, 2, 600],
  ["naija plots", plots as unknown as Any, plots.presets.naija, 2, 8, 3000],
];

for (const [name, def, rules, min, max, steps] of games)
  test.prop([fc.integer({ min, max }), fc.string({ maxLength: 8 })], {
    numRuns: Number(process.env.ALL_FUZZ_RUNS ?? 40),
  })(`${name}: played like the room plays it, nothing breaks`, (players, seed) => {
    expect(() => fuzz(def, rules, players, seed, steps)).not.toThrow();
  });

import { afterAll } from "vitest";
afterAll(() => {
  if (process.env.ALL_FUZZ_STATS)
    for (const [slug, x] of Object.entries(stats))
      console.log(
        `${slug}: ${x.games} games, ${Math.round(x.steps / x.games)} steps on average, ${Math.round((100 * x.over) / x.games)} % finished`,
      );
});
