import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import type { Rng, SeatIndex } from "../../types";
import { buildingsCost, houseCost, naira, plotRent, priceOf, SPACES } from "./board";
import { netWorth, rentOf } from "./core";
import { plots, plotsNaija, type PlotsRules } from "./index";
import { checkInvariants, simulate, T0 } from "./sim";
import type { PlotsAction, PlotsState } from "./state";

const rules = (r: Partial<PlotsRules> = {}): PlotsRules => ({ ...plotsNaija, ...r });

/** An rng that returns these numbers (die faces 1–6 are passed as 1–6), then 0s. */
function dice(...faces: number[]): Rng {
  const q = [...faces];
  return {
    int: (n: number) => Math.min(n - 1, Math.max(0, (q.shift() ?? 1) - (n === 6 ? 1 : 0))),
    shuffle: <T>(a: readonly T[]) => [...a],
    counter: () => 0,
  };
}
const start = (r: PlotsRules = rules(), players = 2) =>
  plots.setup(players, { rng: seededRng("p"), rules: r, now: T0 }, 0);

function act(
  s: PlotsState,
  seat: SeatIndex,
  action: PlotsAction,
  r: PlotsRules = rules(),
  rng: Rng = seededRng("a"),
  now = T0 + 1000,
) {
  const res = plots.apply(s, { seat, action }, { rng, rules: r, now });
  if (!res.ok) throw new Error(`${seat} ${JSON.stringify(action)}: ${res.error}`);
  checkInvariants(res.state, r);
  return res;
}
const reject = (
  s: PlotsState,
  seat: SeatIndex,
  action: PlotsAction,
  r = rules(),
  now = T0 + 1000,
) => {
  const res = plots.apply(s, { seat, action }, { rng: seededRng("a"), rules: r, now });
  return res.ok ? null : res.error;
};
/** Seat on turn rolls these dice. */
const rollTo = (s: PlotsState, a: number, b: number, r = rules(), now = T0 + 1000) =>
  act(s, s.order[s.turn] as SeatIndex, { type: "roll" }, r, dice(a, b), now);

describe("board and money", () => {
  it("40 spaces; rents follow our formula (spot checks against the table in the docs)", () => {
    expect(SPACES).toHaveLength(40);
    // Ojo (Clay: rent factor 3): 7.5 % × ₦80k × 3 = ₦18k.
    expect([0, 1, 2, 3, 4, 5].map((h) => plotRent(1, h))).toEqual([18, 90, 250, 575, 755, 935]);
    // House prices follow the rent each one adds (1.3 landings' worth, weighted by how often the
    // group is landed on; Clay ×0.6, Royal ×0.7), never below the group's floor, and each level at
    // least 10 % dearer than the one before: Banana Island to a hotel ₦3.11M.
    expect([1, 2, 3, 4, 5].map((l) => houseCost(39, l))).toEqual([210, 380, 760, 840, 920]);
    expect(buildingsCost(39, 5)).toBe(3110);
    expect([1, 2, 3, 4, 5].map((l) => houseCost(1, l))).toEqual([60, 110, 220, 240, 260]);
    // Surulere (Sunset, three plots): 7.5 % × ₦220k = ₦17k (rounded).
    expect([0, 1, 5].map((h) => plotRent(16, h))).toEqual([17, 85, 885]);
    expect([naira(80), naira(1200), naira(2000), naira(1050)]).toEqual([
      "₦80k",
      "₦1.2M",
      "₦2M",
      "₦1.05M",
    ]);
  });

  it("every building level costs more than the one before, on every plot (Best, Oct 2026)", () => {
    SPACES.forEach((sp, i) => {
      if (sp.kind !== "plot") return;
      for (let l = 2; l <= 5; l++)
        expect(houseCost(i, l), `${sp.name} level ${l}`).toBeGreaterThan(houseCost(i, l - 1));
    });
  });

  it("setup: ₦2M each, the first seat starts, two shuffled decks of 16", () => {
    const s = start(rules(), 3);
    expect(s.cash).toEqual([2000, 2000, 2000]);
    expect(s.order).toEqual([0, 1, 2]);
    expect([s.decks.gist.length, s.decks.hustle.length]).toEqual([16, 16]);
    checkInvariants(s, rules());
  });
});

describe("turns", () => {
  it("roll, land on an unowned plot, buy it; land on someone's plot, pay rent", () => {
    let s = start();
    s = rollTo(s, 1, 2).state; // 0 → 3 Challenge
    expect(s.pos[0]).toBe(3);
    expect(s.step).toBe("buy");
    expect(reject(s, 0, { type: "end_turn" })).toBe("NOT_ALLOWED");
    s = act(s, 0, { type: "buy" }).state;
    expect([s.owner[3], s.cash[0], s.step]).toEqual([0, 1910, "manage"]);
    s = act(s, 0, { type: "end_turn" }).state;
    const res = rollTo(s, 2, 1); // seat 1: 0 → 3
    expect(res.events).toContainEqual({ type: "rent", from: 1, to: 0, space: 3, amount: 20 });
    expect([res.state.cash[0], res.state.cash[1]]).toEqual([1930, 1980]);
  });

  it("doubles roll again; a third double goes to the Police Post", () => {
    let s = start();
    s = rollTo(s, 2, 2).state; // → 4 Danfo Park
    s = act(s, 0, { type: "decline" }, rules({ auctions: false })).state;
    expect(s.step).toBe("roll");
    s = rollTo(s, 3, 3, rules({ auctions: false })).state; // → 10 just visiting
    s = rollTo(s, 1, 1, rules({ auctions: false })).state;
    expect([s.pos[0], s.detained[0], s.step]).toEqual([10, 0, "manage"]);
  });

  it("passing Payday pays the salary; Checkpoint sends you to the Police Post", () => {
    let s = { ...start(), pos: [36, 0] } as PlotsState;
    s = rollTo(s, 3, 1).state; // 36 → 0
    expect(s.cash[0]).toBe(2300);
    s = { ...start(), pos: [25, 0] } as PlotsState;
    const res = rollTo(s, 4, 1); // 25 → 30
    expect(res.state.pos[0]).toBe(10);
    expect(res.state.detained[0]).toBe(0);
    expect(res.state.cash[0]).toBe(2000);
  });

  it("leaving the Police Post: doubles, paying ₦60k, a Bail card, or paying after the third try", () => {
    const held = { ...start(), pos: [10, 0], detained: [0, null] } as PlotsState;
    const out = rollTo(held, 3, 3);
    expect(out.state.detained[0]).toBeNull();
    expect(out.state.pos[0]).toBe(16);
    expect(out.state.step).not.toBe("roll"); // no extra roll after leaving on doubles
    const paid = act(held, 0, { type: "pay_fine" });
    expect([paid.state.detained[0], paid.state.cash[0], paid.state.step]).toEqual([
      null,
      1940,
      "roll",
    ]);
    const third = rollTo({ ...held, detained: [2, null] } as PlotsState, 1, 2);
    expect(third.state.detained[0]).toBeNull();
    expect(third.state.cash[0]).toBe(1940);
    expect(third.state.pos[0]).toBe(13);
    const bail = {
      ...held,
      bail: { gist: 0, hustle: null },
      decks: { ...held.decks, gist: held.decks.gist.filter((x) => x !== 9) },
    } as PlotsState;
    const used = act(bail, 0, { type: "use_bail" });
    expect(used.state.bail.gist).toBeNull();
    expect(used.state.decks.gist.at(-1)).toBe(9);
  });
});

/** A board where seat 0 owns all of Clay and Sky, and seat 1 owns transport. */
function owned(): PlotsState {
  const s = start();
  const owner = [...s.owner];
  for (const i of [1, 3, 6, 7, 9]) owner[i] = 0;
  for (const i of [4, 14]) owner[i] = 1;
  return { ...s, owner, step: "manage", ledger: { bankOut: 0, bankIn: 0 } };
}

describe("rent, building and mortgages", () => {
  it("full group doubles unbuilt rent; transport by count; utilities by dice", () => {
    const s = owned();
    expect(rentOf(s, 1, 7, rules())).toBe(36);
    expect(rentOf(s, 4, 7, rules())).toBe(60);
    const u = { ...s, owner: s.owner.map((o, i) => (i === 13 ? 1 : i === 27 ? 1 : o)) };
    expect(rentOf(u, 13, 7, rules())).toBe(84);
  });

  it("builds evenly, from the bank's supply; hotel swaps four houses back", () => {
    let s: PlotsState = { ...owned(), cash: [9000, 2000], ledger: { bankOut: 7000, bankIn: 0 } };
    expect(reject(s, 0, { type: "build", space: 9 }, rules())).toBeNull();
    s = act(s, 0, { type: "build", space: 6 }).state;
    expect(reject(s, 0, { type: "build", space: 6 })).toBe("NOT_ALLOWED"); // uneven
    for (let round = 0; round < 4; round++)
      for (const i of [1, 3])
        if ((s.houses[i] ?? 0) <= round) s = act(s, 0, { type: "build", space: i }).state;
    s = act(s, 0, { type: "build", space: 1 }).state; // 5th → hotel
    expect(s.houses[1]).toBe(5);
    expect(s.bank.hotels).toBe(11);
    expect(reject(s, 0, { type: "mortgage", space: 1 })).toBe("NOT_ALLOWED");
  });

  it("selling a hotel when the bank is short of houses goes down to what it can give", () => {
    let s = owned();
    s = {
      ...s,
      houses: s.houses.map((h, i) => (i === 1 || i === 3 ? 5 : h)),
      bank: { houses: 2, hotels: 10 },
    };
    // A small supply so the bank adds up: 2 houses in all, both in the bank.
    const res = act(s, 0, { type: "sell_building", space: 1 }, rules({ houseSupply: 2 }));
    expect(res.state.houses[1]).toBe(2);
    expect(res.state.bank).toEqual({ houses: 0, hotels: 11 });
    // Half of what the hotel and the 4th and 3rd houses cost on Ojo: 130 + 120 + 110.
    expect(res.state.cash[0]).toBe(2000 + 360);
  });

  it("mortgage for half the price; unmortgage with 10 % interest", () => {
    let s = owned();
    s = act(s, 0, { type: "mortgage", space: 9 }).state;
    expect([s.mortgaged[9], s.cash[0]]).toEqual([true, 2075]);
    expect(rentOf(s, 9, 7, rules())).toBe(0);
    s = act(s, 0, { type: "unmortgage", space: 9 }).state;
    expect(s.cash[0]).toBe(2075 - 83);
  });
});

describe("trading a mortgaged plot", () => {
  it("cash moves before the interest: you can't go below zero (fuzz find, Oct 2026)", () => {
    // Seat 1 has ₦37k, gives ₦32k and gets a mortgaged plot whose 10 % interest is ₦6k.
    const base = owned();
    let s: PlotsState = {
      ...base,
      owner: base.owner.map((o, i) => (i === 6 ? 0 : i === 19 ? 1 : o)),
      mortgaged: base.mortgaged.map((m, i) => i === 6),
      cash: [2000, 37],
      ledger: { bankOut: 60, bankIn: 2023 },
    };
    s = act(s, 0, {
      type: "offer",
      to: 1,
      give: { cash: 0, plots: [6], bail: 0 },
      get: { cash: 32, plots: [], bail: 0 },
    }).state;
    const res = act(s, 1, { type: "accept_offer", id: 1 });
    // ₦5k left after the ₦32k: the ₦6k interest is a debt to raise, never negative cash.
    expect(res.state.cash[1]).toBe(5);
    expect(res.state.debts).toEqual([{ from: 1, to: "bank", amount: 6 }]);
  });
});

describe("managing any time", () => {
  it("you build on your own turn only, and can mortgage to afford a plot you landed on", () => {
    const s: PlotsState = { ...owned(), turn: 1, step: "roll" };
    expect(reject(s, 0, { type: "build", space: 1 })).toBe("NOT_ALLOWED"); // seat 1's turn
    expect(act({ ...s, turn: 0 }, 0, { type: "build", space: 1 }).state.houses[1]).toBe(1);
    // Seat 1 lands on Banana Island with too little cash: mortgage, then buy.
    let b: PlotsState = {
      ...start(),
      owner: owned().owner,
      turn: 1,
      step: "buy",
      pos: [0, 39],
      cash: [2000, 500],
    };
    b = { ...b, ledger: { bankOut: 0, bankIn: 1500 } };
    expect(reject(b, 1, { type: "buy" })).toBe("NOT_ALLOWED");
    b = act(b, 1, { type: "mortgage", space: 4 }).state;
    b = act(b, 1, { type: "buy" }).state;
    expect(b.owner[39]).toBe(1);
  });

  it("nobody manages during an auction; during a debt only the debtor, only to raise cash", () => {
    let s = rollTo(start(rules(), 3), 1, 2).state;
    s = act(s, 0, { type: "decline" }).state;
    expect(reject(s, 1, { type: "mortgage", space: 3 })).toBe("NOT_ALLOWED");
    const debt = { ...owned(), debts: [{ from: 1, to: 0 as const, amount: 50 }] };
    expect(reject(debt, 0, { type: "build", space: 1 })).toBe("NOT_ALLOWED");
    const paid = act({ ...debt, cash: [2000, 10], ledger: { bankOut: 0, bankIn: 1990 } }, 1, {
      type: "auto_pay",
    });
    expect(paid.state.debts).toEqual([]);
  });
});

describe("auctions", () => {
  it("decline starts an auction everyone may bid in; each bid resets the 8 s timer", () => {
    let s = rollTo(start(rules(), 3), 1, 2).state;
    s = act(s, 0, { type: "decline" }).state;
    expect(s.auction?.space).toBe(3);
    expect(plots.currentSeats(s)).toEqual([0, 1, 2]);
    s = act(s, 1, { type: "bid", amount: 10 }, rules(), seededRng("a"), T0 + 2000).state;
    expect(s.auction?.endsAt).toBe(T0 + 2000 + 8000);
    expect(reject(s, 2, { type: "bid", amount: 15 }, rules(), T0 + 3000)).toBe("NOT_ALLOWED");
    s = act(s, 2, { type: "bid", amount: 50 }, rules(), seededRng("a"), T0 + 3000).state;
    s = act(s, 0, { type: "pass_bid" }, rules(), seededRng("a"), T0 + 4000).state;
    const res = act(s, 1, { type: "pass_bid" }, rules(), seededRng("a"), T0 + 5000);
    expect(res.events).toContainEqual({ type: "auction_won", seat: 2, space: 3, amount: 50 });
    expect([res.state.owner[3], res.state.cash[2], res.state.auction]).toEqual([2, 1950, null]);
    expect(res.state.step).toBe("manage");
  });

  it("time runs out: the high bid wins (a late bid is refused by the clock)", () => {
    let s = rollTo(start(rules(), 3), 1, 2).state;
    s = act(s, 0, { type: "decline" }).state;
    s = act(s, 1, { type: "bid", amount: 30 }, rules(), seededRng("a"), T0 + 2000).state;
    expect(plots.turnDeadline?.(s, 0, rules())).toBe(T0 + 10_000);
    const late = act(s, 2, { type: "bid", amount: 100 }, rules(), seededRng("a"), T0 + 11_000);
    expect(late.state.owner[3]).toBe(1);
    expect(plots.timeoutAction(s, 0, rules(), seededRng("t"))).toEqual({ type: "pass_bid" });
  });
});

describe("debts and bankruptcy", () => {
  it("rent you can't pay: raise cash by mortgaging, or go bankrupt to the owner", () => {
    let s = owned();
    s = {
      ...s,
      turn: 1,
      step: "roll",
      cash: [2000, 5],
      pos: [0, 0],
      ledger: { bankOut: 0, bankIn: 1995 },
    };
    s = { ...s, owner: s.owner.map((o, i) => (i === 3 ? 0 : o)) };
    const owes = rollTo(s, 1, 2); // seat 1 lands on 3 (Clay, full group: ₦40k)
    expect(owes.state.debts).toEqual([{ from: 1, to: 0, amount: 40 }]);
    expect(plots.currentSeats(owes.state)).toEqual([1]);
    expect(reject(owes.state, 1, { type: "end_turn" })).toBe("NOT_ALLOWED");
    const raised = act(owes.state, 1, { type: "mortgage", space: 4 });
    expect(raised.state.debts).toEqual([]);
    expect(raised.state.cash[1]).toBe(5 + 110 - 40);
    const broke = act(owes.state, 1, { type: "declare_bankruptcy" });
    expect(broke.state.out).toEqual([1]);
    expect(broke.state.owner[4]).toBe(0);
    expect(broke.state.places).toEqual([[0], [1]]);
  });

  it("bankrupt to the bank: their plots are auctioned one by one", () => {
    let s = owned();
    s = {
      ...start(rules(), 3),
      owner: s.owner,
      turn: 1,
      cash: [2000, 0, 2000],
      pos: [0, 34, 0],
      ledger: { bankOut: 0, bankIn: 2000 },
    };
    const res = rollTo(s, 1, 1); // 34 → 36 Diesel Money ₦120k... doubles: lands, owes the bank
    expect(res.state.debts[0]).toMatchObject({ from: 1, to: "bank", amount: 120 });
    const out = act(res.state, 1, { type: "declare_bankruptcy" });
    expect(out.state.out).toEqual([1]);
    expect(out.state.auction?.space).toBe(4);
    expect(out.state.auctionQueue).toEqual([14]);
  });
});

describe("room settings (Best, Oct 2026)", () => {
  it("bankrupt to the bank: the creditor gets the cash owed; plots go to auction", () => {
    let s = owned();
    s = {
      ...start(rules(), 3),
      owner: s.owner.map((o, i) => (i === 3 ? 0 : o)),
      turn: 1,
      step: "roll",
      cash: [2000, 25, 2000],
      pos: [0, 0, 0],
      ledger: { bankOut: 25, bankIn: 2000 },
    };
    const r = rules({ bankruptTo: "bank" });
    const owes = rollTo(s, 1, 2, r); // seat 1 lands on 3 (Clay, full group): owes seat 0 ₦40k
    expect(owes.state.debts).toEqual([{ from: 1, to: 0, amount: 40 }]);
    const out = act(owes.state, 1, { type: "declare_bankruptcy" }, r);
    expect(out.state.out).toEqual([1]);
    expect(out.state.cash[0]).toBe(2000 + 25); // all the cash seat 1 had, up to what was owed
    expect(out.state.owner[4]).toBeNull(); // seat 1's transport goes up for auction
    expect(out.state.auction?.space).toBe(4);
    expect(out.state.auctionQueue).toEqual([14]);
  });

  it("build only where you landed this turn", () => {
    const r = rules({ buildOnLanding: true });
    const s: PlotsState = { ...owned(), cash: [9000, 2000], pos: [1, 0], step: "manage" };
    expect(reject(s, 0, { type: "build", space: 3 }, r)).toBe("NOT_ALLOWED");
    expect(reject(s, 0, { type: "build", space: 1 }, r)).toBeNull();
    // Before rolling, the plot you stand on is last turn's landing.
    expect(reject({ ...s, step: "roll" }, 0, { type: "build", space: 1 }, r)).toBe("NOT_ALLOWED");
    // Rolling again after doubles: you did land there this turn.
    expect(
      reject({ ...s, step: "roll", again: true }, 0, { type: "build", space: 1 }, r),
    ).toBeNull();
  });
});

describe("trading", () => {
  it("offer, accept: plots and cash change hands; the contents stay private to the two", () => {
    let s = owned();
    s = act(s, 1, {
      type: "offer",
      to: 0,
      give: { cash: 200, plots: [14], bail: 0 },
      get: { cash: 0, plots: [9], bail: 0 },
    }).state;
    const spectator = plots.view(s, "spectator");
    expect(spectator.offers[0]).toMatchObject({ hidden: true });
    expect("decks" in spectator).toBe(false);
    expect(plots.view(s, 0).offers[0]).toMatchObject({ give: { cash: 200 } });
    expect(
      reject(s, 1, {
        type: "offer",
        to: 0,
        give: { cash: 1, plots: [], bail: 0 },
        get: { cash: 0, plots: [], bail: 0 },
      }),
    ).toBe("NOT_ALLOWED");
    const done = act(s, 0, { type: "accept_offer", id: 1 });
    expect([
      done.state.owner[14],
      done.state.owner[9],
      done.state.cash[0],
      done.state.cash[1],
    ]).toEqual([0, 1, 2200, 1800]);
  });

  it("offers expire after a minute; a plot in a built-up group can't be traded", () => {
    let s = owned();
    s = act(s, 1, {
      type: "offer",
      to: 0,
      give: { cash: 10, plots: [], bail: 0 },
      get: { cash: 0, plots: [1], bail: 0 },
    }).state;
    expect(reject(s, 0, { type: "accept_offer", id: 1 }, rules(), T0 + 62_000)).toBe("NOT_ALLOWED");
    const built = {
      ...owned(),
      houses: owned().houses.map((h, i) => (i === 1 || i === 3 ? 1 : h)),
    };
    expect(
      reject(built, 1, {
        type: "offer",
        to: 0,
        give: { cash: 10, plots: [], bail: 0 },
        get: { cash: 0, plots: [1], bail: 0 },
      }),
    ).toBe("NOT_ALLOWED");
  });
});

describe("the end", () => {
  it("timed: when the clock runs out, the round finishes, then places by net worth", () => {
    let s = start(rules({ auctions: false }), 3);
    s = rollTo(s, 1, 2, rules({ auctions: false })).state;
    expect(s.endsAt).toBe(T0 + 1000 + 45 * 60_000);
    s = act(s, 0, { type: "buy" }).state;
    const late = T0 + 46 * 60_000;
    let res = act(s, 0, { type: "end_turn" }, rules(), seededRng("a"), late);
    expect(res.events).toContainEqual({ type: "last_round" });
    s = res.state;
    for (const seat of [1, 2]) {
      s = act(s, seat, { type: "roll" }, rules({ auctions: false }), dice(2, 3), late).state;
      if (s.step === "buy")
        s = act(
          s,
          seat,
          { type: "decline" },
          rules({ auctions: false }),
          seededRng("a"),
          late,
        ).state;
      if (s.step === "roll")
        s = act(s, seat, { type: "roll" }, rules({ auctions: false }), dice(1, 2), late).state;
      res = act(s, seat, { type: "end_turn" }, rules({ auctions: false }), seededRng("a"), late);
      s = res.state;
    }
    expect(s.places).not.toBeNull();
    expect(plots.isOver(s)).toBe(true);
    const worth = (s.places ?? []).map(([x]) => netWorth(s, x as number, rules()));
    expect([...worth].sort((a, b) => b - a)).toEqual(worth);
  });
});

describe("whole games", () => {
  test.prop([fc.integer({ min: 2, max: 8 }), fc.string({ maxLength: 8 })], { numRuns: 60 })(
    "bots play to the end; money and buildings are conserved after every action",
    (players, seed) => {
      const levels = (["easy", "medium", "hard"] as const).flatMap((l) => Array(3).fill(l));
      const r = rules({ mode: "classic" });
      const { state } = simulate(r, players, seed, {
        levels: levels.slice(0, players),
        check: true,
      });
      expect(state.places?.flat().sort()).toEqual(Array.from({ length: players }, (_, i) => i));
    },
  );

  test.prop([fc.string({ maxLength: 8 })], { numRuns: 30 })(
    "timed games end by the clock",
    (seed) => {
      const { state, now } = simulate(rules(), 4, seed, { check: true });
      expect(state.places).toHaveLength(4);
      // By the clock, unless everyone but one went bankrupt first.
      expect(now >= (state.endsAt ?? Infinity) || state.out.length === 3).toBe(true);
    },
  );

  it("same seed, same game", () => {
    const a = simulate(rules(), 4, "same");
    const b = simulate(rules(), 4, "same");
    expect(a.state).toEqual(b.state);
  });

  it("house rules: Owambe jackpot, double salary on Payday", () => {
    const r = rules({ owambeJackpot: true, doubleSalaryOnExactLanding: true, mode: "classic" });
    for (const seed of ["j1", "j2", "j3"]) simulate(r, 4, seed, { check: true });
    let s = { ...start(r), pos: [36, 0] } as PlotsState;
    s = act(s, 0, { type: "roll" }, r, dice(1, 3)).state;
    expect(s.cash[0]).toBe(2600);
  });

  it("price lookups", () => {
    expect(priceOf(39)).toBe(520);
    expect(priceOf(0)).toBe(0);
  });
});
