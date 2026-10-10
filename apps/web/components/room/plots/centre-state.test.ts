import {
  plots,
  plotsNaija,
  seededRng,
  type PlotsAction,
  type PlotsRules,
  type PlotsState,
  type SeatIndex,
} from "@gamehub/engine";
import { describe, expect, it } from "vitest";
import { centreActions, centreState, plotChoices } from "./centre-state";

const T0 = 1_000_000;

/** Every button the table would enable for `seat` must be accepted by the engine. */
function checkOffers(s: PlotsState, rules: PlotsRules, seat: SeatIndex, now: number) {
  const view = plots.view(s, seat);
  const cs = centreState(view, rules, seat);
  const offered: PlotsAction[] = [...centreActions(cs)];
  s.owner.forEach((o, space) => {
    if (o !== seat) return;
    const c = plotChoices(view, rules, seat, space);
    if (c.build === null) offered.push({ type: "build", space });
    if (c.sell === null) offered.push({ type: "sell_building", space });
    if (c.mortgage === null) offered.push({ type: "mortgage", space });
    if (c.unmortgage === null) offered.push({ type: "unmortgage", space });
  });
  for (const action of offered) {
    const res = plots.apply(s, { seat, action }, { rng: seededRng("x"), rules, now });
    if (!res.ok)
      throw new Error(
        `table offers ${JSON.stringify(action)} to ${seat} (${cs.kind}) but the game says ${res.error}`,
      );
  }
  // Whoever the game waits on always has something to press.
  if (plots.currentSeats(s).includes(seat) && !centreActions(cs).length)
    throw new Error(`seat ${seat} is waited on (${cs.kind}) but has no button`);
  return offered.length;
}

function play(rules: PlotsRules, players: number, seed: string) {
  const rng = seededRng(seed);
  let now = T0;
  let s = plots.setup(players, { rng, rules, now }, 0);
  let checked = 0;
  for (let step = 0; step < 6000 && !s.places; step++) {
    now += 1000;
    if (step % 2 === 0)
      for (let seat = 0; seat < players; seat++) checked += checkOffers(s, rules, seat, now);
    const seat = plots.currentSeats(s)[0] as SeatIndex;
    const level = (["easy", "medium", "hard"] as const)[seat % 3] ?? "medium";
    let res = plots.apply(
      s,
      { seat, action: plots.bots[level](s, seat, rules, rng) },
      { rng, rules, now },
    );
    if (!res.ok)
      res = plots.apply(
        s,
        { seat, action: plots.timeoutAction(s, seat, rules, rng) },
        { rng, rules, now },
      );
    if (!res.ok) throw new Error(`stuck at step ${step}`);
    s = res.state;
    for (let i = 0; i < players; i++) {
      if (plots.currentSeats(s).includes(i)) continue;
      const reply = plots.botReply?.(s, i, rules);
      const r = reply ? plots.apply(s, { seat: i, action: reply }, { rng, rules, now }) : null;
      if (r?.ok) s = r.state;
    }
  }
  return { s, checked };
}

describe("Naija Plots table offers only what the game accepts", () => {
  for (const [name, rules, players] of [
    ["classic, 4 players", { ...plotsNaija, mode: "classic" as const }, 4],
    ["timed, 3 players", plotsNaija, 3],
    [
      "classic, 6 players, house rules",
      { ...plotsNaija, mode: "classic" as const, owambeJackpot: true },
      6,
    ],
  ] as const)
    it(`${name}: whole games, every step`, () => {
      for (const seed of ["a", "b", "c"]) {
        const { checked } = play(rules, players, `${name}-${seed}`);
        expect(checked).toBeGreaterThan(100);
      }
    }, 300_000);
});
