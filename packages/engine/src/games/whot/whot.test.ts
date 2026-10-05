import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import type { SeatIndex } from "../../types";
import { DECK, SHAPES } from "./cards";
import { whot, type WhotRules, type WhotState } from "./index";
import type { WhotAction } from "./state";

const rules = (r: Partial<WhotRules> = {}): WhotRules => ({ ...whot.presets.naija, ...r });
const ctx = (r: WhotRules, seed = "s") => ({ rng: seededRng(seed), rules: r, now: 0 });

/**
 * A hand-built position. Remaining cards go to the market (so all 54 stay accounted for);
 * `marketTop` puts specific cards on top of it, last one drawn first.
 */
function position(
  p: {
    hands: string[][];
    top: string;
    turn?: number;
    marketTop?: string[];
    marketSize?: number;
  } & Partial<WhotState>,
): WhotState {
  const used = new Set([...p.hands.flat(), p.top, ...(p.marketTop ?? [])]);
  let rest = DECK.filter((c) => !used.has(c));
  if (p.marketSize !== undefined) rest = rest.slice(0, p.marketSize);
  const { marketTop = [], top, marketSize: _m, pile: _p, ...rest2 } = p;
  return {
    players: p.hands.length,
    market: [...rest, ...marketTop],
    pile: [...(p.pile ?? []), top],
    callShape: null,
    turn: 0,
    pendingPick: null,
    lastCardDeclared: p.hands.map(() => false),
    lastCardDue: null,
    finished: [],
    over: false,
    places: null,
    misses: [],
    reshuffles: 0,
    ...rest2,
  } as WhotState;
}

function act(s: WhotState, seat: SeatIndex, action: WhotAction, r: WhotRules) {
  const res = whot.apply(s, { seat, action }, ctx(r));
  if (!res.ok) throw new Error(`${seat} ${JSON.stringify(action)}: ${res.error}`);
  return res.state;
}
const playCard = (
  card: string,
  requestShape?: WhotAction extends infer A
    ? A extends { requestShape?: infer S }
      ? S
      : never
    : never,
): WhotAction => (requestShape ? { type: "play", card, requestShape } : { type: "play", card });
const reject = (s: WhotState, seat: SeatIndex, action: WhotAction, r: WhotRules) => {
  const res = whot.apply(s, { seat, action }, ctx(r));
  return res.ok ? null : res.error;
};

describe("whot dealing", () => {
  it("deals the hand size to everyone and flips a call card; 54 cards in play", () => {
    const s = whot.setup(4, ctx(rules({ handSize: 6 })));
    expect(s.hands.map((h) => h.length)).toEqual([6, 6, 6, 6]);
    expect(s.pile).toHaveLength(1);
    expect(s.hands.flat().length + s.market.length + s.pile.length).toBe(54);
  });

  it("deals fewer when a big table would empty the market", () => {
    const s = whot.setup(8, ctx(rules({ handSize: 8 })));
    expect(s.hands[0]!.length).toBeLessThan(8);
    expect(s.market.length).toBeGreaterThanOrEqual(10);
  });

  it("a special first card does nothing by default, and applies when set", () => {
    const r = rules({ firstCardEffect: "apply" });
    for (let i = 0; i < 300; i++) {
      const s = whot.setup(3, ctx(r, `f${i}`));
      if (s.pile[0]!.endsWith("-2")) {
        expect(s.pendingPick).toEqual({ amount: 2, kind: 2 });
        const off = whot.setup(3, ctx(rules(), `f${i}`));
        expect(off.pendingPick).toBeNull();
        return;
      }
    }
    throw new Error("no seed dealt a 2 first");
  });
});

describe("whot matching", () => {
  const r = rules();
  it("matches by shape or number; anything else is refused", () => {
    const s = position({
      hands: [["circle-3", "cross-7", "square-11"], ["star-1"]],
      top: "circle-7",
    });
    expect(act(s, 0, playCard("circle-3"), r).pile.at(-1)).toBe("circle-3");
    expect(act(s, 0, playCard("cross-7"), r).pile.at(-1)).toBe("cross-7");
    expect(reject(s, 0, playCard("square-11"), r)).toBe("ILLEGAL_MOVE");
    expect(reject(s, 1, playCard("star-1"), r)).toBe("NOT_YOUR_TURN");
    expect(reject(s, 0, playCard("star-1"), r)).toBe("NO_SUCH_CARD");
  });

  it("Whot is wild, must name a shape, and the next player follows it or goes to market", () => {
    const s = position({
      hands: [
        ["whot-20-a", "circle-3"],
        ["triangle-4", "star-4"],
      ],
      top: "square-13",
    });
    expect(reject(s, 0, playCard("whot-20-a"), r)).toBe("BAD_ACTION");
    const t = act(s, 0, playCard("whot-20-a", "star"), r);
    expect(t).toMatchObject({ callShape: "star", turn: 1 });
    expect(reject(t, 1, playCard("triangle-4"), r)).toBe("MUST_PLAY_REQUESTED_SHAPE");
    const u = act(t, 1, playCard("star-4"), r);
    expect(u.callShape).toBeNull();
  });

  it("market draws one and passes the turn", () => {
    const s = position({
      hands: [["square-11"], ["star-1"]],
      top: "circle-7",
      marketTop: ["triangle-8"],
    });
    const t = act(s, 0, { type: "market" }, r);
    expect(t.hands[0]).toEqual(["square-11", "triangle-8"]);
    expect(t.turn).toBe(1);
  });
});

describe("whot special cards", () => {
  it("1 Hold on: play again; off: turn passes", () => {
    const s = position({ hands: [["circle-1", "circle-4"], ["star-2"]], top: "circle-7" });
    expect(act(s, 0, playCard("circle-1"), rules()).turn).toBe(0);
    expect(act(s, 0, playCard("circle-1"), rules({ holdOn: false })).turn).toBe(1);
  });

  it("2 Pick two: defend with a 2 (stacks to 4) or pick; no stacking means pick", () => {
    const r = rules();
    const s = position({
      hands: [
        ["circle-2", "star-3"],
        ["triangle-2", "square-5", "star-7"],
        ["cross-2", "cross-5"],
      ],
      top: "circle-7",
    });
    const t = act(s, 0, playCard("circle-2"), r);
    expect(t).toMatchObject({ pendingPick: { amount: 2, kind: 2 }, turn: 1 });
    expect(reject(t, 1, playCard("square-5"), r)).toBe("MUST_ANSWER_PENALTY");
    const u = act(t, 1, playCard("triangle-2"), r);
    expect(u.pendingPick).toEqual({ amount: 4, kind: 2 });
    const v = act(u, 2, { type: "market" }, r);
    expect(v.hands[2]).toHaveLength(2 + 4);
    expect(v.pendingPick).toBeNull();

    const noStack = rules({ stackPenalties: false });
    const t2 = act(s, 0, playCard("circle-2"), noStack);
    expect(reject(t2, 1, playCard("triangle-2"), noStack)).toBe("MUST_ANSWER_PENALTY");
  });

  it("5 Pick three; cross-stack lets a 2 answer a 5 when it's on", () => {
    const s = position({
      hands: [
        ["circle-5", "star-3"],
        ["triangle-2", "star-7"],
      ],
      top: "circle-7",
    });
    const t = act(s, 0, playCard("circle-5"), rules());
    expect(t.pendingPick).toEqual({ amount: 3, kind: 5 });
    expect(reject(t, 1, playCard("triangle-2"), rules())).toBe("MUST_ANSWER_PENALTY");
    const x = act(s, 0, playCard("circle-5"), rules({ crossStack: true }));
    expect(act(x, 1, playCard("triangle-2"), rules({ crossStack: true })).pendingPick).toEqual({
      amount: 5,
      kind: 2,
    });
  });

  it("Whot can't answer a penalty", () => {
    const s = position({
      hands: [
        ["circle-2", "star-3"],
        ["whot-20-a", "star-7"],
      ],
      top: "circle-7",
    });
    const t = act(s, 0, playCard("circle-2"), rules());
    expect(reject(t, 1, playCard("whot-20-a", "star"), rules())).toBe("MUST_ANSWER_PENALTY");
  });

  it("8 Suspension skips the next player; with two players you go again", () => {
    const s3 = position({
      hands: [["circle-8", "star-3"], ["star-1"], ["star-4"]],
      top: "circle-7",
    });
    expect(act(s3, 0, playCard("circle-8"), rules()).turn).toBe(2);
    const s2 = position({ hands: [["circle-8", "star-3"], ["star-1"]], top: "circle-7" });
    expect(act(s2, 0, playCard("circle-8"), rules()).turn).toBe(0);
  });

  it("14 General market: everyone else picks one and you play again", () => {
    const s = position({
      hands: [["circle-14", "star-3"], ["star-1"], ["star-4"]],
      top: "circle-7",
    });
    const t = act(s, 0, playCard("circle-14"), rules());
    expect(t.hands.map((h) => h.length)).toEqual([1, 2, 2]);
    expect(t.turn).toBe(0);
  });
});

describe("whot last card", () => {
  const r = rules();
  it("forgetting to declare costs two when the next player moves", () => {
    const s = position({
      hands: [
        ["circle-3", "star-4"],
        ["circle-10", "star-5", "star-7"],
      ],
      top: "circle-7",
    });
    const t = act(s, 0, playCard("circle-3"), r);
    expect(t.lastCardDue).toBe(0);
    const u = act(t, 1, playCard("circle-10"), r);
    expect(u.hands[0]).toHaveLength(1 + 2);
    expect(u.lastCardDue).toBeNull();
  });

  it("declaring (with two cards on your turn, or once on one) avoids the penalty", () => {
    const s = position({
      hands: [
        ["circle-3", "star-4"],
        ["circle-10", "star-5"],
      ],
      top: "circle-7",
    });
    const declared = act(s, 0, { type: "declare_last_card" }, r);
    const t = act(declared, 0, playCard("circle-3"), r);
    expect(t.lastCardDue).toBeNull();
    // Late but before the next move also counts.
    const late = act(act(s, 0, playCard("circle-3"), r), 0, { type: "declare_last_card" }, r);
    expect(act(late, 1, playCard("circle-10"), r).hands[0]).toHaveLength(1);
  });

  it("no penalty when the rule is off", () => {
    const off = rules({ mustDeclareLastCard: false });
    const s = position({
      hands: [
        ["circle-3", "star-4"],
        ["circle-10", "star-5"],
      ],
      top: "circle-7",
    });
    expect(
      act(act(s, 0, playCard("circle-3"), off), 1, playCard("circle-10"), off).hands[0],
    ).toHaveLength(1);
    expect(reject(s, 0, { type: "declare_last_card" }, off)).toBe("ILLEGAL_MOVE");
  });
});

describe("whot ending", () => {
  it("first to empty their hand wins; the rest rank by hand total (stars double)", () => {
    const s = position({
      hands: [["circle-3"], ["star-5", "circle-1"], ["square-10"], ["triangle-4", "circle-4"]],
      top: "circle-7",
      lastCardDeclared: [true, false, false, false],
    });
    const t = act(s, 0, playCard("circle-3"), rules());
    expect(t.over).toBe(true);
    // star-5 = 10 + 1 = 11; square-10 = 10; 4 + 4 = 8
    expect(whot.ranking(t)).toEqual([[0], [3], [2], [1]]);
  });

  it("can't finish on a special card when that's off", () => {
    const r = rules({ canFinishOnSpecial: false });
    const s = position({
      hands: [["circle-2"], ["star-5"]],
      top: "circle-7",
      lastCardDeclared: [true, false],
    });
    expect(reject(s, 0, playCard("circle-2"), r)).toBe("ILLEGAL_MOVE");
    expect(act(s, 0, playCard("circle-2"), rules()).over).toBe(true);
  });

  it("Check up must accompany the winning card when required", () => {
    const r = rules({ checkUpRequired: true });
    const s = position({
      hands: [["circle-3"], ["star-5"]],
      top: "circle-7",
      lastCardDeclared: [true, false],
    });
    expect(reject(s, 0, playCard("circle-3"), r)).toBe("ILLEGAL_MOVE");
    expect(act(s, 0, { type: "play", card: "circle-3", checkUp: true }, r).over).toBe(true);
  });

  it("market runs out: count by default, reshuffle the pile when set", () => {
    const base = {
      hands: [["square-11"], ["star-1", "star-2"]],
      top: "circle-7",
      pile: ["circle-3", "circle-4"],
      marketSize: 0,
    };
    const counted = act(position(base), 0, { type: "market" }, rules());
    expect(counted.over).toBe(true);
    expect(whot.ranking(counted)).toEqual([[1], [0]]); // star-1 + star-2 = 6 < 11
    const re = act(position(base), 0, { type: "market" }, rules({ marketExhausted: "reshuffle" }));
    expect(re.over).toBe(false);
    expect(re.hands[0]).toHaveLength(2);
    expect(re.pile).toEqual(["circle-7"]);
  });

  it("play on: the game continues until one player is left", () => {
    const r = rules({ multiWinner: "playOn" });
    const s = position({
      hands: [["circle-3"], ["circle-4", "star-1"], ["circle-5", "star-2"]],
      top: "circle-7",
      lastCardDeclared: [true, false, false],
    });
    const t = act(s, 0, playCard("circle-3"), r);
    expect(t).toMatchObject({ over: false, finished: [0], turn: 1 });
  });
});

describe("whot views", () => {
  it("you see your own hand and only counts for everyone else; spectators see no hands", () => {
    const s = whot.setup(3, ctx(rules()));
    const v = whot.view(s, 1);
    expect(v.you?.hand).toEqual(s.hands[1]);
    expect(v.counts).toEqual(s.hands.map((h) => h.length));
    for (const card of [...s.hands[0]!, ...s.hands[2]!])
      expect(JSON.stringify(v)).not.toContain(`"${card}"`);
    expect(whot.view(s, "spectator").you).toBeNull();
  });
});

// ── Properties ───────────────────────────────────────────────────────────────

const rulesArb = fc.record({
  turnSeconds: fc.integer({ min: 10, max: 120 }),
  handSize: fc.integer({ min: 3, max: 8 }),
  holdOn: fc.boolean(),
  pickTwo: fc.boolean(),
  pickThree: fc.boolean(),
  suspension: fc.boolean(),
  generalMarket: fc.boolean(),
  stackPenalties: fc.boolean(),
  crossStack: fc.boolean(),
  mustDeclareLastCard: fc.boolean(),
  lastCardPenalty: fc.integer({ min: 1, max: 4 }),
  checkUpRequired: fc.boolean(),
  canFinishOnSpecial: fc.boolean(),
  marketExhausted: fc.constantFrom("count" as const, "reshuffle" as const),
  firstCardEffect: fc.constantFrom("none" as const, "apply" as const),
  multiWinner: fc.constantFrom("rankByCount" as const, "playOn" as const),
});
const seedArb = fc.string({ minLength: 1, maxLength: 16 });
const playersArb = fc.integer({ min: 2, max: 8 });

function randomGame(players: number, r: WhotRules, seed: string, onStep?: (s: WhotState) => void) {
  const rng = seededRng(seed);
  let s = whot.setup(players, { rng, rules: r, now: 0 });
  let steps = 0;
  while (!whot.isOver(s)) {
    if (steps++ > 2000) throw new Error("did not end within 2,000 actions");
    // Mostly the player on turn; sometimes someone else declares last card.
    const seat = rng.int(5) === 0 ? rng.int(players) : s.turn;
    const legal = whot.legalActions(s, seat, r);
    if (!legal.length) continue;
    const res = whot.apply(
      s,
      { seat, action: legal[rng.int(legal.length)]! },
      { rng, rules: r, now: 0 },
    );
    if (!res.ok) throw new Error(`legal action rejected: ${res.error}`);
    s = res.state;
    onStep?.(s);
  }
  return s;
}

describe("whot properties", () => {
  test.prop([playersArb, rulesArb, seedArb], { numRuns: 1000 })(
    "54 cards, no duplicates, penalties only under a 2 or 5, and every game ends",
    (players, r, seed) => {
      const s = randomGame(players, r, seed, (st) => {
        const all = [...st.hands.flat(), ...st.market, ...st.pile];
        expect(all).toHaveLength(54);
        expect(new Set(all).size).toBe(54);
        if (st.pendingPick) expect(st.pile.at(-1)).toMatch(/-(2|5)$/);
        st.hands.forEach((h, seat) => h.length === 0 && expect(st.finished).toContain(seat));
      });
      expect(
        whot
          .ranking(s)
          .flat()
          .sort((a, b) => a - b),
      ).toEqual(Array.from({ length: players }, (_, i) => i));
    },
  );

  test.prop([playersArb, rulesArb, seedArb], { numRuns: 1000 })(
    "no view ever contains another player's cards",
    (players, r, seed) => {
      randomGame(players, r, seed, (st) => {
        for (const viewer of [
          ...Array.from({ length: players }, (_, i) => i),
          "spectator" as const,
        ]) {
          // Every card id anywhere in the view (the public pile excluded) must be the viewer's own.
          const json = JSON.stringify({ ...whot.view(st, viewer), pileTop: [], top: "" });
          const own = new Set(viewer === "spectator" ? [] : st.hands[viewer]);
          for (const [, card] of json.matchAll(
            /"((?:circle|triangle|cross|square|star)-\d+|whot-20-[a-e])"/g,
          ))
            expect(own.has(card!), `${String(viewer)} sees ${card}`).toBe(true);
        }
      });
    },
  );

  test.prop([playersArb, rulesArb, seedArb], { numRuns: 200 })(
    "same seed, same game",
    (players, r, seed) => {
      expect(randomGame(players, r, seed)).toEqual(randomGame(players, r, seed));
    },
  );

  test.prop(
    [
      playersArb,
      rulesArb,
      seedArb,
      fc.constantFrom("easy" as const, "medium" as const, "hard" as const),
    ],
    {
      numRuns: 300,
    },
  )("bots and timeouts only make legal moves, and bot games end", (players, r, seed, level) => {
    const rng = seededRng(seed);
    let s = whot.setup(players, { rng, rules: r, now: 0 });
    for (let i = 0; i < 3000 && !s.over; i++) {
      const seat = s.turn;
      const a = seat % 2 ? whot.bots[level](s, seat, r, rng) : whot.timeoutAction(s, seat, r, rng);
      expect(whot.legalActions(s, seat, r)).toContainEqual(a);
      const res = whot.apply(s, { seat, action: a }, { rng, rules: r, now: 0 });
      if (!res.ok) throw new Error(res.error);
      s = res.state;
    }
    expect(s.over).toBe(true);
  });
});

describe("whot illegal actions", () => {
  const anyAction = fc.oneof(
    fc.record({
      type: fc.constant("play" as const),
      card: fc.constantFrom(...DECK),
      requestShape: fc.option(fc.constantFrom(...SHAPES), { nil: undefined }),
      checkUp: fc.option(fc.boolean(), { nil: undefined }),
    }),
    fc.constant({ type: "market" as const }),
    fc.constant({ type: "declare_last_card" as const }),
  );

  test.prop(
    [
      playersArb,
      rulesArb,
      seedArb,
      fc.array(fc.tuple(fc.nat(7), anyAction), { minLength: 1, maxLength: 60 }),
    ],
    {
      numRuns: 1000,
    },
  )("anything outside legalActions is refused and nothing throws", (players, r, seed, tries) => {
    const rng = seededRng(seed);
    let s = whot.setup(players, { rng, rules: r, now: 0 });
    for (const [rawSeat, raw] of tries) {
      if (s.over) break;
      const seat = rawSeat % players;
      // Drop undefined keys so toContainEqual compares like for like.
      // checkUp: false means the same as leaving it out.
      const action = JSON.parse(
        JSON.stringify(raw, (k, v: unknown) => (k === "checkUp" && v === false ? undefined : v)),
      ) as WhotAction;
      const legal = whot.legalActions(s, seat, r);
      const res = whot.apply(s, { seat, action }, { rng, rules: r, now: 0 });
      const isLegal = legal.some((a) => JSON.stringify(a) === JSON.stringify(action));
      if (!isLegal) expect(res.ok, JSON.stringify(action)).toBe(false);
      // Keep the game moving with a real move from whoever is on turn.
      const moves = whot.legalActions(s, s.turn, r);
      const next = whot.apply(
        s,
        { seat: s.turn, action: moves[rng.int(moves.length)]! },
        { rng, rules: r, now: 0 },
      );
      if (next.ok) s = next.state;
    }
  });
});

describe("whot bots", () => {
  it("hard beats easy more than 60% of the time head to head", () => {
    const r = rules();
    let hardWins = 0;
    const games = 1000;
    for (let g = 0; g < games; g++) {
      const rng = seededRng(`h${g}`);
      const hardSeat = g % 2;
      let s = whot.setup(2, { rng, rules: r, now: 0 });
      for (let i = 0; i < 3000 && !s.over; i++) {
        const seat = s.turn;
        const a = whot.bots[seat === hardSeat ? "hard" : "easy"](s, seat, r, rng);
        const res = whot.apply(s, { seat, action: a }, { rng, rules: r, now: 0 });
        if (!res.ok) throw new Error(res.error);
        s = res.state;
      }
      if (whot.ranking(s)[0]?.includes(hardSeat)) hardWins++;
    }
    expect(hardWins / games).toBeGreaterThan(0.6);
  });
});

describe("whot bot pacing", () => {
  it("bots go to market quickly and take a moment over special cards", () => {
    const s = whot.setup(2, ctx(rules()));
    const think = whot.botThinkMs!;
    expect(think(s, { type: "market" })).toEqual([800, 1200]);
    expect(think(s, { type: "play", card: "circle-7" })).toEqual([1200, 2000]);
    expect(think(s, { type: "play", card: "whot-20-a", requestShape: "star" })).toEqual([
      1800, 2600,
    ]);
    expect(think(s, { type: "play", card: "star-14" })).toEqual([1800, 2600]);
  });
});
