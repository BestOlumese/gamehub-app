import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import { createFootballGame, LEAD_MINUTES, msPerMinute, SOLO_BANDS } from "./game";
import { PEN_MS, TIMEOUT_MS } from "./rules";
import { footballNaija, type FootballRules } from "./rules";
import type { FootballAction, FootballState } from "./state";
import { testDataset } from "./test-data";

const game = createFootballGame(testDataset);
const T0 = 1_000_000;

type Sim = { s: FootballState; now: number; rules: FootballRules; events: string[] };

function start(players: number, rules: Partial<FootballRules> = {}, seed = "g"): Sim {
  const r = { ...footballNaija, ...rules };
  const s = game.setup(players, { rng: seededRng(seed), rules: r, now: T0 });
  return { s, now: T0, rules: r, events: [] };
}

function act(sim: Sim, seat: number, action: FootballAction) {
  const res = game.apply(
    sim.s,
    { seat, action },
    { rng: seededRng("a"), rules: sim.rules, now: sim.now },
  );
  if (!res.ok) throw new Error(`${seat} ${JSON.stringify(action)}: ${res.error}`);
  sim.s = res.state;
  sim.events.push(...res.events.map((e) => e.type));
  return res;
}

/** Drives the room like the realtime server: bots or timeouts for waiting seats, ticks while live. */
function run(
  sim: Sim,
  opts: { level?: "easy" | "medium" | "hard"; onStep?: (sim: Sim) => void } = {},
) {
  for (let guard = 0; guard < 20_000 && !game.isOver(sim.s); guard++) {
    opts.onStep?.(sim);
    const auto = game.autoAdvance(sim.s, sim.rules);
    if (auto) {
      sim.now += auto.afterMs;
      act(sim, auto.seat, auto.action);
      // Bots answer after every action (touchline changes).
      sim.s.managers.forEach((_, seat) => {
        const reply = game.botReply?.(sim.s, seat, sim.rules);
        if (reply) {
          const r = game.apply(
            sim.s,
            { seat, action: reply },
            { rng: seededRng("b"), rules: sim.rules, now: sim.now },
          );
          if (r.ok) sim.s = r.state;
        }
      });
      continue;
    }
    const seats = game.currentSeats(sim.s);
    if (!seats.length) throw new Error(`stuck in ${sim.s.phase}`);
    sim.now += 500;
    for (const seat of seats) {
      if (!game.currentSeats(sim.s).includes(seat)) continue;
      const a = game.bots[opts.level ?? "medium"](sim.s, seat, sim.rules, seededRng(`bot${guard}`));
      act(sim, seat, a);
    }
  }
  expect(game.isOver(sim.s)).toBe(true);
  return sim;
}

describe("football room", () => {
  it("1v1: draft 19 picks each, arrange, play a knockout match to a winner", () => {
    const sim = start(2);
    expect(sim.s.mode).toBe("h2h_single");
    expect(sim.s.managers[0]?.offer?.kind).toBe("formation");
    expect(sim.s.managers[0]?.total).toBe(19);
    run(sim);
    const f = sim.s.rounds[0]?.[0];
    expect(f?.result?.winner).not.toBe("draw");
    expect(game.ranking(sim.s)).toHaveLength(2);
    expect(sim.events).toContain("teams_revealed");
    expect(sim.events).toContain("half_time");
  });

  it("the draft: no player twice, captain in a matching slot, picks hidden from events", () => {
    const sim = start(2);
    for (let k = 0; k < 19; k++)
      for (const seat of [0, 1]) {
        const m = sim.s.managers[seat];
        if (!m?.offer) continue;
        const a = game.timeoutAction(sim.s, seat, sim.rules, seededRng("t"));
        const res = act(sim, seat, a);
        for (const e of res.events)
          expect(Object.keys(e)).toEqual(expect.arrayContaining(["type"]));
        for (const e of res.events) expect(JSON.stringify(e)).not.toMatch(/choice|id"/);
      }
    for (const m of sim.s.managers) {
      const ids = [...Object.values(m.xi), ...m.subs];
      expect(new Set(ids).size).toBe(18);
      expect(m.sheet?.xi).toHaveLength(11);
    }
  });

  it("hidden information: no view shows another manager's options or picks before kickoff", () => {
    const sim = start(3, {}, "hidden");
    for (let k = 0; k < 10; k++)
      for (const seat of [0, 1, 2])
        act(sim, seat, game.timeoutAction(sim.s, seat, sim.rules, seededRng("t")));
    const theirs = (seat: number) => {
      const m = sim.s.managers[seat] as FootballState["managers"][number];
      return [...(m.offer?.ids ?? []), ...Object.values(m.xi), ...m.subs].filter(
        (x) => typeof x === "string",
      ) as string[];
    };
    const v0 = JSON.stringify(game.view(sim.s, 0));
    const spectator = JSON.stringify(game.view(sim.s, "spectator"));
    for (const id of [...theirs(1), ...theirs(2)]) {
      if (theirs(0).includes(id)) continue; // the same player can be in two drafts
      expect(v0).not.toContain(`"${id}"`);
    }
    for (const id of [...theirs(0), ...theirs(1), ...theirs(2)])
      expect(spectator).not.toContain(`"${id}"`);
    expect(v0).not.toContain(sim.s.seed);
  });

  it("live: a shout changes your tactics from the next minute; changes are rate-limited", () => {
    const sim = start(2, {}, "live");
    // Draft and ready both.
    while (sim.s.phase === "draft")
      for (const seat of game.currentSeats(sim.s))
        act(sim, seat, game.timeoutAction(sim.s, seat, sim.rules, seededRng("t")));
    expect(sim.s.phase).toBe("live");
    sim.now += 3000;
    act(sim, 0, { type: "tick" });
    act(sim, 0, { type: "shout", shout: "press" });
    const f = sim.s.rounds[0]?.[0];
    expect(f?.match?.teams[0].tactics.defence).toBe("high_press");
    expect(f?.log.some((e) => e.t === "tactics")).toBe(true);
    const again = game.apply(
      sim.s,
      { seat: 0, action: { type: "shout", shout: "hold" } },
      { rng: seededRng("x"), rules: sim.rules, now: sim.now + 500 },
    );
    expect(again.ok).toBe(false);
    // A sub: bench ↔ pitch.
    sim.now += 2500;
    act(sim, 0, { type: "swap", a: { slot: 5 }, b: { bench: 2 } });
    expect(sim.s.rounds[0]?.[0]?.match?.teams[0].subsUsed).toBe(1);
  });

  it("ticks send at most a few minutes ahead of the playback", () => {
    const sim = start(2, {}, "lead");
    while (sim.s.phase === "draft")
      for (const seat of game.currentSeats(sim.s))
        act(sim, seat, game.timeoutAction(sim.s, seat, sim.rules, seededRng("t")));
    const per = msPerMinute(sim.rules);
    for (let k = 0; k < 5; k++) {
      sim.now += game.autoAdvance(sim.s, sim.rules)?.afterMs ?? 0;
      act(sim, 0, { type: "tick" });
      const f = sim.s.rounds[0]?.[0];
      const playedTo = Math.floor((sim.now - (f?.startedAt ?? 0)) / per);
      expect(f?.match?.minute).toBeLessThanOrEqual(playedTo + LEAD_MINUTES);
    }
  });

  it("the result waits until the screens have shown the last minute (or the last penalty)", () => {
    for (const seed of ["end1", "end2", "end3"]) {
      const sim = run(start(2, {}, seed));
      const f = sim.s.rounds[0]?.[0];
      if (!f) throw new Error("no fixture");
      const seg = f.log.slice(f.halfFrom);
      const pens = seg.filter((e) => e.t === "pen").length;
      const shownBy = pens
        ? f.startedAt + pens * PEN_MS
        : f.startedAt + seg.filter((e) => e.t === "ball").length * msPerMinute(sim.rules);
      expect(sim.now).toBeGreaterThanOrEqual(shownBy);
    }
  });

  it("stamina is private: you see your own players' legs and tiring lines, not theirs", () => {
    let checked = false;
    run(start(2, {}, "legs"), {
      onStep: (sim) => {
        const f = sim.s.rounds[0]?.[0];
        if (!f?.match || checked) return;
        const tired = f.log.filter((e) => e.t === "tired");
        if (!tired.length) return;
        for (const seat of [0, 1] as const) {
          const v = game.view(sim.s, seat).rounds[0]?.[0];
          const fit = v?.live?.fit ?? {};
          const mine = new Set(f.match.teams[seat].xi.map((x) => x.id));
          expect(Object.keys(fit).length).toBeGreaterThan(0);
          for (const id of Object.keys(fit)) expect(mine.has(id)).toBe(true);
          for (const e of v?.log ?? []) if (e.t === "tired") expect(e.team).toBe(seat);
        }
        const watching = game.view(sim.s, "spectator").rounds[0]?.[0];
        expect(watching?.live?.fit ?? null).toBeNull();
        expect(watching?.log.some((e) => e.t === "tired")).toBe(false);
        checked = true;
      },
    });
    expect(checked).toBe(true);
  });

  it("timeouts: the match freezes, changes skip the gap, two each, only the caller resumes", () => {
    const sim = start(2, {}, "pause");
    while (sim.s.phase === "draft")
      for (const seat of game.currentSeats(sim.s))
        act(sim, seat, game.timeoutAction(sim.s, seat, sim.rules, seededRng("t")));
    const per = msPerMinute(sim.rules);
    sim.now += 10 * per;
    act(sim, 0, { type: "tick" });
    const f = () => sim.s.rounds[0]?.[0] as NonNullable<FootballState["rounds"][0][0]>;
    const minute = f().match?.minute;
    const started = f().startedAt;
    act(sim, 0, { type: "timeout" });
    expect(f().pause).toMatchObject({ by: 0, until: sim.now + TIMEOUT_MS });
    // Frozen: ticks during the timeout play nothing.
    sim.now += 10_000;
    act(sim, 0, { type: "tick" });
    expect(f().match?.minute).toBe(minute);
    // No rush during a timeout: two changes in a row are fine.
    act(sim, 0, { type: "shout", shout: "press" });
    act(sim, 0, { type: "shout", shout: "hold" });
    // Only the caller ends it early.
    expect(
      game.apply(
        sim.s,
        { seat: 1, action: { type: "resume" } },
        { rng: seededRng("r"), rules: sim.rules, now: sim.now },
      ).ok,
    ).toBe(false);
    act(sim, 0, { type: "resume" });
    expect(f().pause).toBeNull();
    expect(f().startedAt).toBe(started + 10_000);
    // A second one runs its full 20 s, then the clock moves on by exactly that.
    act(sim, 0, { type: "timeout" });
    const at = sim.now;
    sim.now += TIMEOUT_MS + 5_000;
    act(sim, 0, { type: "tick" });
    expect(f().pause).toBeNull();
    expect(f().startedAt).toBe(started + 10_000 + TIMEOUT_MS);
    expect(at).toBeGreaterThan(0);
    // Two a match.
    expect(
      game.apply(
        sim.s,
        { seat: 0, action: { type: "timeout" } },
        { rng: seededRng("r"), rules: sim.rules, now: sim.now },
      ).ok,
    ).toBe(false);
    act(sim, 1, { type: "timeout" });
    expect(game.view(sim.s, 1).rounds[0]?.[0]?.timeouts).toEqual([2, 1]);
  });

  it("instructions: yours stay hidden from them; marks must name one of theirs on the pitch", () => {
    const sim = start(2, {}, "orders");
    while (sim.s.phase === "draft")
      for (const seat of game.currentSeats(sim.s))
        act(sim, seat, game.timeoutAction(sim.s, seat, sim.rules, seededRng("t")));
    const m = sim.s.rounds[0]?.[0]?.match;
    const target = m?.teams[1].xi.find((x) => x.pos !== "GK")?.id as string;
    act(sim, 0, {
      type: "instructions",
      instructions: { flank: "right", mark: target, press: null },
    });
    const mine = game.view(sim.s, 0).rounds[0]?.[0]?.live?.now[0];
    expect(mine?.instructions).toEqual({ flank: "right", mark: target, press: null });
    expect(JSON.stringify(game.view(sim.s, 1))).not.toMatch(/"flank":"right"/);
    sim.now += 3000;
    const bad = game.apply(
      sim.s,
      {
        seat: 0,
        action: {
          type: "instructions",
          instructions: { flank: "left", mark: "nobody", press: null },
        },
      },
      { rng: seededRng("r"), rules: sim.rules, now: sim.now },
    );
    expect(bad.ok).toBe(false);
  });

  it("team talk: once per break, a lift for 15 minutes, and only you hear how it went", () => {
    let done = false;
    run(start(2, {}, "talk"), {
      onStep: (sim) => {
        if (done || sim.s.phase !== "break") return;
        const f = sim.s.rounds[0]?.[0];
        const m = f?.match;
        if (!f || !m) return;
        const before = m.half;
        act(sim, 0, { type: "talk", talk: "fire" });
        const r = game.apply(
          sim.s,
          { seat: 0, action: { type: "talk", talk: "calm" } },
          { rng: seededRng("r"), rules: sim.rules, now: sim.now },
        );
        expect(r.ok).toBe(false);
        const me = game.view(sim.s, 0).me?.talk;
        expect(me?.pick).toBe("fire");
        expect(me?.text.length).toBeGreaterThan(5);
        expect(JSON.stringify(game.view(sim.s, 1))).not.toContain(me?.text as string);
        const t = sim.s.rounds[0]?.[0]?.match?.teams[0].talk;
        expect(t?.until).toBe((before === 1 ? 45 : 90) + 15);
        done = true;
      },
    });
    expect(done).toBe(true);
  });

  it("league of 4 bots: everyone plays everyone once; the table adds up", () => {
    const sim = run(start(4, {}, "league"));
    expect(sim.s.mode).toBe("league");
    expect(sim.s.rounds).toHaveLength(3);
    const t = sim.s.table;
    expect(t.reduce((a, r) => a + r.p, 0)).toBe(12);
    expect(t.reduce((a, r) => a + r.w, 0)).toBe(t.reduce((a, r) => a + r.l, 0));
    expect(t.reduce((a, r) => a + r.gf, 0)).toBe(t.reduce((a, r) => a + r.ga, 0));
    for (const r of t) expect(r.pts).toBe(3 * r.w + r.d);
    expect(game.ranking(sim.s).flat().sort()).toEqual([0, 1, 2, 3]);
  });

  it("knockout of 6: byes, one champion, everyone placed", () => {
    const sim = run(start(6, {}, "ko"));
    expect(sim.s.mode).toBe("knockout");
    const places = game.ranking(sim.s);
    expect(places[0]).toHaveLength(1);
    expect(places.flat().sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("odd league (5): a bye each round", () => {
    const sim = run(start(5, {}, "odd"));
    expect(sim.s.rounds).toHaveLength(5);
    for (const round of sim.s.rounds) expect(round.filter((f) => f.b === "bye")).toHaveLength(1);
  });

  it("best of 3: first to two wins", () => {
    const sim = run(start(2, { mode: "h2h_bo3" }, "bo3"));
    expect(Math.max(...sim.s.series)).toBe(2);
  });

  it("solo run: bot XIs of rising strength; one loss ends it; skip plays out the half", () => {
    const sim = start(1, {}, "solo");
    expect(sim.s.mode).toBe("solo");
    let skipped = false;
    run(sim, {
      onStep: (x) => {
        if (x.s.phase === "live" && !skipped) {
          act(x, 0, { type: "skip" });
          skipped = true;
        }
      },
    });
    sim.s.bots.forEach((b, r) =>
      expect(Math.abs(b.rating - (SOLO_BANDS[r] as number))).toBeLessThanOrEqual(2),
    );
    expect(sim.events).toContain("run_over");
  });

  it("same seed, same room", () => {
    const a = run(start(2, {}, "det"));
    const b = run(start(2, {}, "det"));
    expect(a.s.rounds[0]?.[0]?.result).toEqual(b.s.rounds[0]?.[0]?.result);
  });
});
