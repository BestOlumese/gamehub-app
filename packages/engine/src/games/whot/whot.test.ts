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

// ── Decking (house rule) ─────────────────────────────────────────────────────

describe("whot decking", () => {
  const done: WhotAction = { type: "done" };
  const types = (s: WhotState, seat: SeatIndex, r: WhotRules) =>
    whot.legalActions(s, seat, r).map((a) => (a.type === "play" ? a.card : a.type));

  it("is off by default: one card, then the turn passes", () => {
    const r = rules();
    const s = position({
      hands: [["triangle-3", "star-3", "square-7"], ["circle-1"]],
      top: "circle-3",
    });
    const after = act(s, 0, playCard("triangle-3"), r);
    expect([after.turn, after.deck ?? null]).toEqual([1, null]);
  });

  it("same number: keep playing the first card's number, then it ends by itself", () => {
    const r = rules({ decking: "number" });
    const s = position({
      hands: [["triangle-3", "star-3", "square-7"], ["circle-1"], ["cross-1"]],
      top: "circle-3",
    });
    const open = act(s, 0, playCard("triangle-3"), r);
    expect(open.turn).toBe(0);
    expect(open.deck).toMatchObject({ count: 1, kind: "number" });
    expect(types(open, 0, r)).toEqual(["declare_last_card", "star-3", "done"]);
    expect(reject(open, 0, playCard("square-7"), r)).toBe("ILLEGAL_MOVE");
    expect(reject(open, 0, { type: "market" }, r)).toBe("ILLEGAL_MOVE");
    expect(reject(open, 1, playCard("circle-1"), r)).toBe("NOT_YOUR_TURN");
    const res = whot.apply(open, { seat: 0, action: playCard("star-3") }, ctx(r));
    if (!res.ok) throw new Error(res.error);
    expect(res.state).toMatchObject({
      turn: 1,
      deck: null,
      pile: ["circle-3", "triangle-3", "star-3"],
    });
    expect(res.events).toContainEqual({ type: "decked", seat: 0, count: 2 });
  });

  it("Hold on in a deck: carry on with a card of the same shape (Best, Oct 2026 bug)", () => {
    const r = rules({ decking: "number" });
    const s = position({
      hands: [["circle-1", "triangle-1", "circle-7", "star-4"], ["cross-2"], ["square-5"]],
      top: "circle-3",
    });
    const open = act(s, 0, playCard("circle-1"), r);
    expect(open.deck).toMatchObject({ count: 1 });
    // The follow-up isn't a 1, but after a Hold on any normal play is fine: the deck ends.
    expect(types(open, 0, r)).toContain("circle-7");
    const res = whot.apply(open, { seat: 0, action: playCard("circle-7") }, ctx(r));
    if (!res.ok) throw new Error(res.error);
    expect(res.state).toMatchObject({ deck: null, turn: 1 });
    expect(res.state.pile.slice(-2)).toEqual(["circle-1", "circle-7"]);
    // Something that doesn't follow a circle-1 is still refused.
    expect(reject(open, 0, playCard("star-4"), r)).toBe("ILLEGAL_MOVE");
  });

  it("Done after a Hold on (or General market) keeps your extra go", () => {
    const r = rules({ decking: "number" });
    const s = position({
      hands: [["circle-1", "triangle-1", "star-4"], ["cross-2"]],
      top: "circle-3",
    });
    const open = act(s, 0, playCard("circle-1"), r);
    const after = act(open, 0, done, r);
    expect([after.turn, after.deck]).toEqual([0, null]);
    const gm = position({
      hands: [["circle-14", "star-14", "circle-9", "triangle-4"], ["cross-2"], ["square-5"]],
      top: "circle-3",
    });
    const opened = act(gm, 0, playCard("circle-14"), r);
    expect(opened.hands[1]).toHaveLength(2); // everyone else picked one
    const go = act(opened, 0, playCard("circle-9"), r);
    expect([go.deck, go.turn]).toEqual([null, 1]);
    const market = act(opened, 0, { type: "market" }, r);
    expect([market.deck, market.turn, market.hands[0]?.length]).toEqual([null, 1, 4]);
  });

  it("a deck with a pick in it gives no extra go, even ending on a Hold on", () => {
    const r = rules({ decking: "chain" });
    const s = position({
      hands: [["circle-2", "circle-1", "circle-7", "star-4"], ["cross-2"]],
      top: "circle-3",
    });
    const a = act(s, 0, playCard("circle-2"), r);
    const b = act(a, 0, playCard("circle-1"), r);
    expect(reject(b, 0, playCard("star-4"), r)).toBe("ILLEGAL_MOVE");
    const after = act(b, 0, done, r);
    expect([after.turn, after.pendingPick?.amount]).toEqual([1, 2]);
  });

  it("Done ends a deck early; a timeout does the same", () => {
    const r = rules({ decking: "number" });
    const s = position({
      hands: [["triangle-3", "star-3", "square-3", "cross-7"], ["circle-1"]],
      top: "circle-3",
    });
    const open = act(s, 0, playCard("triangle-3"), r);
    expect(whot.timeoutAction(open, 0, r, seededRng("t"))).toEqual(done);
    const after = act(open, 0, done, r);
    expect([after.turn, after.deck, after.hands[0]]).toEqual([
      1,
      null,
      ["star-3", "square-3", "cross-7"],
    ]);
    expect(reject(after, 1, done, r)).toBe("ILLEGAL_MOVE"); // no deck open
  });

  it("same number or shape: the second card decides which, and it holds", () => {
    const r = rules({ decking: "numberOrShape" });
    const s = position({
      hands: [["circle-7", "circle-11", "triangle-7", "square-13"], ["cross-1"]],
      top: "circle-3",
    });
    const open = act(s, 0, playCard("circle-7"), r);
    expect(types(open, 0, r)).toEqual(["circle-11", "triangle-7", "done"]);
    const shapeDeck = act(open, 0, playCard("circle-11"), r);
    // A circle deck now: the 7 of triangles no longer fits, so the deck has ended.
    expect([shapeDeck.turn, shapeDeck.deck]).toEqual([1, null]);
  });

  it("chain: each card matches the one before by number or shape", () => {
    const r = rules({ decking: "chain" });
    const s = position({
      hands: [["circle-4", "triangle-4", "triangle-10", "cross-10", "star-1"], ["square-1"]],
      top: "circle-3",
    });
    let st = s;
    for (const card of ["circle-4", "triangle-4", "triangle-10", "cross-10"])
      st = act(st, 0, playCard(card), r);
    expect([st.turn, st.deck, st.hands[0]]).toEqual([1, null, ["star-1"]]);
  });

  it("every special counts: picks add up, each 8 skips one more", () => {
    const r = rules({ decking: "number" });
    const picks = act(
      act(
        position({
          hands: [["circle-2", "triangle-2", "star-3"], ["cross-1"], ["square-1"]],
          top: "circle-7",
        }),
        0,
        playCard("circle-2"),
        r,
      ),
      0,
      playCard("triangle-2"),
      r,
    );
    expect([picks.turn, picks.pendingPick]).toEqual([1, { amount: 4, kind: 2 }]);

    const res = whot.apply(
      act(
        position({
          hands: [["circle-8", "triangle-8", "star-3"], ["cross-1"], ["square-1"], ["star-1"]],
          top: "circle-7",
        }),
        0,
        playCard("circle-8"),
        r,
      ),
      { seat: 0, action: playCard("triangle-8") },
      ctx(r),
    );
    if (!res.ok) throw new Error(res.error);
    expect(res.state.turn).toBe(3);
    expect(res.events).toContainEqual({ type: "suspension", skipped: 1, count: 2, seats: [1, 2] });
  });

  it("mixed specials add up in order: a 2 then an 8 skips one, the next picks 2", () => {
    const r = rules({ decking: "numberOrShape" });
    const s = position({
      hands: [["circle-2", "circle-8", "triangle-13"], ["cross-1"], ["square-1"], ["star-1"]],
      top: "circle-7",
    });
    const after = act(act(s, 0, playCard("circle-2"), r), 0, playCard("circle-8"), r);
    expect([after.turn, after.pendingPick]).toEqual([2, { amount: 2, kind: 2 }]);
  });

  it("general markets each hit everyone at once; ending on one (no pick or skip) plays again", () => {
    const r = rules({ decking: "number" });
    const s = position({
      hands: [["circle-14", "triangle-14", "star-3"], ["cross-1"], ["square-1"]],
      top: "circle-7",
    });
    const after = act(act(s, 0, playCard("circle-14"), r), 0, playCard("triangle-14"), r);
    expect(after.hands.map((h) => h.length)).toEqual([1, 3, 3]);
    expect([after.turn, after.deck]).toEqual([0, null]);
  });

  it("a hold on after a pick doesn't keep the turn: the pick goes on", () => {
    const r = rules({ decking: "numberOrShape" });
    const s = position({
      hands: [["circle-2", "circle-1", "triangle-13"], ["cross-1"], ["square-1"]],
      top: "circle-7",
    });
    const after = act(act(s, 0, playCard("circle-2"), r), 0, playCard("circle-1"), r);
    expect([after.turn, after.pendingPick]).toEqual([1, { amount: 2, kind: 2 }]);
  });

  it("a Whot can only end a deck", () => {
    const r = rules({ decking: "number" });
    const s = position({
      hands: [["triangle-3", "whot-20-a", "star-3"], ["cross-1"]],
      top: "circle-3",
    });
    const open = act(s, 0, playCard("triangle-3"), r);
    const after = act(open, 0, playCard("whot-20-a", "star"), r);
    expect([after.turn, after.deck, after.callShape, after.hands[0]]).toEqual([
      1,
      null,
      "star",
      ["star-3"],
    ]);
    // Played first, a Whot is a deck of one.
    const first = act(s, 0, playCard("whot-20-a", "circle"), r);
    expect([first.turn, first.deck]).toEqual([1, null]);
  });

  it("defend a penalty, then deck more of the same: the total grows", () => {
    const r = rules({ decking: "number" });
    const s = position({
      hands: [["triangle-2", "star-2", "square-7"], ["cross-1"], ["square-1"]],
      top: "circle-2",
      pendingPick: { amount: 2, kind: 2 },
    });
    const after = act(act(s, 0, playCard("triangle-2"), r), 0, playCard("star-2"), r);
    expect([after.turn, after.pendingPick]).toEqual([1, { amount: 6, kind: 2 }]);
  });

  it("going out on a 14 counts even when everyone's draw empties the market", () => {
    // Found by the property test: the general market ran the market dry before the player
    // was marked finished, leaving an empty hand that hadn't won.
    const r = rules({ decking: "numberOrShape" });
    const s = position({
      hands: [["square-3", "square-14"], ["cross-1"], ["star-1"], ["circle-1"], ["triangle-1"]],
      top: "square-7",
      marketSize: 2,
    });
    const after = act(act(s, 0, playCard("square-3"), r), 0, playCard("square-14"), r);
    expect(after.over).toBe(true);
    expect(after.finished).toContain(0);
    expect(after.places?.[0]).toEqual([0]);
  });

  it("decking down to one card without saying Last card still costs you", () => {
    const r = rules({ decking: "number" });
    const s = position({
      hands: [["triangle-3", "star-3", "square-7"], ["cross-1"]],
      top: "circle-3",
    });
    const after = act(act(s, 0, playCard("triangle-3"), r), 0, playCard("star-3"), r);
    expect(after.lastCardDue).toBe(0);
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
  decking: fc.constantFrom(
    "off" as const,
    "number" as const,
    "numberOrShape" as const,
    "chain" as const,
  ),
  whotBlocksPick: fc.boolean(),
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
        // Plain checks: expect() on every step of every game is too slow.
        if (all.length !== 54 || new Set(all).size !== 54) throw new Error("cards lost or doubled");
        // With decking, a 2 or 5 can sit under later cards of the same deck.
        if (st.pendingPick && r.decking === "off" && !/-(2|5)$/.test(st.pile.at(-1) ?? ""))
          throw new Error("penalty without a 2 or 5 on top");
        if (st.deck && (st.deck.seat !== st.turn || st.over || r.decking === "off"))
          throw new Error("deck open off its player's turn");
        st.hands.forEach((h, seat) => {
          if (h.length === 0 && !st.finished.includes(seat))
            throw new Error("empty hand not finished");
        });
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
          // (An open deck's cards are face up on the pile, so they're public too.)
          const json = JSON.stringify({
            ...whot.view(st, viewer),
            pileTop: [],
            top: "",
            deck: null,
          });
          const own = new Set(viewer === "spectator" ? [] : st.hands[viewer]);
          for (const [, card] of json.matchAll(
            /"((?:circle|triangle|cross|square|star)-\d+|whot-20-[a-e])"/g,
          ))
            if (!own.has(card!)) throw new Error(`${String(viewer)} sees ${card}`);
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
      // Plain check, not expect(): this loop runs a lot.
      const legal = whot.legalActions(s, seat, r).map((x) => JSON.stringify(x));
      if (!legal.includes(JSON.stringify(a))) throw new Error(`illegal ${JSON.stringify(a)}`);
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

describe("whot blocks a pick (house rule)", () => {
  const facing = (_r: WhotRules) =>
    position({
      hands: [["star-4"], ["whot-20-a", "circle-9", "cross-3"], ["square-5"]],
      top: "circle-2",
      turn: 1,
      pendingPick: { amount: 2, kind: 2 },
    });

  it("off: a Whot can't answer a Pick 2", () => {
    const r = rules();
    expect(reject(facing(r), 1, playCard("whot-20-a", "star"), r)).toBe("MUST_ANSWER_PENALTY");
  });

  it("on: the Whot blocks it and calls a shape; nobody picks", () => {
    const r = rules({ whotBlocksPick: true });
    const res = whot.apply(facing(r), { seat: 1, action: playCard("whot-20-a", "star") }, ctx(r));
    if (!res.ok) throw new Error(res.error);
    expect(res.state).toMatchObject({ pendingPick: null, callShape: "star", turn: 2 });
    expect(res.events).toContainEqual({ type: "blocked", seat: 1, amount: 2 });
    expect(res.state.hands[1]).toHaveLength(2);
  });

  it("on, with decking: same, and the deck carries no penalty", () => {
    const r = rules({ whotBlocksPick: true, decking: "number" });
    const s = { ...facing(r), pendingPick: { amount: 5, kind: 5 as const } };
    const res = whot.apply(s, { seat: 1, action: playCard("whot-20-a", "cross") }, ctx(r));
    if (!res.ok) throw new Error(res.error);
    expect(res.state).toMatchObject({ pendingPick: null, callShape: "cross", turn: 2, deck: null });
  });
});
