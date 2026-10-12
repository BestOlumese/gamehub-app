// The Football Draft GameDefinition: draft, arrange, live matches in 3-minute chunks, breaks,
// leagues, knockouts, best of 3 and the solo run (docs/games/football-draft/modes.md).
// `createFootballGame(dataset)` closes over the player data (the engine imports nothing).
import { seededRng } from "../../rng";
import type { GameDefinition, GameEvent, Rng, RuleErrorCode, SeatIndex } from "../../types";
import {
  autoDraft,
  bestForSlot,
  captainOptions,
  captainSlots,
  formationOptions,
  highestOvr,
  LUCK,
  makePool,
  placedXi,
  slotOptions,
  subGroups,
  subOptions,
  type Luck,
  type Pool,
} from "./draft";
import {
  applyChange,
  clockMinute,
  DEFAULT_TACTICS,
  isFinished,
  nextPhase,
  playMinutes,
  shootout,
  startHalf,
  startMatch,
  whyNotChange,
  winner,
  type Change,
  type MatchState,
  type Side,
  type Streams,
  type TeamSheet,
} from "./match";
import { bestRole, formation, POSITION_ROLES } from "./pitch";
import {
  footballNaija,
  LEAD_MINUTES,
  PLAYBACK_SLACK_MINUTES,
  modeFor,
  msPerMinute,
  PEN_MS,
  SOLO_BANDS,
  type FootballRules,
} from "./rules";
import { footballActionSchema, footballRulesSchema } from "./schemas";
import { lookupOf } from "./sheets";
import { SHOUTS } from "./shouts";
import type {
  BotTeam,
  Card,
  Fixture,
  FixtureView,
  FootballAction,
  FootballState,
  FootballView,
  Manager,
  Offer,
  SlotRef,
  TableRow,
  Team,
} from "./state";
import type { FootballDataset, FootballPlayer } from "./types";

/** Live changes: one every 2 s per manager. */
const CHANGE_GAP_MS = 2000;

const BOT_NAMES = [
  "Lagos Select",
  "Garki United",
  "Old GRA Stars",
  "Kano Pillars Select",
  "Enugu Coal City XI",
  "Ibadan Oluyole",
  "Port Harcourt Garden City",
  "Jos Plateau XI",
] as const;

/** Events kept from earlier halves in views (the phone keeps the rest of the feed itself). */
const BIG = new Set([
  "goal",
  "sub",
  "pen",
  "kickoff",
  "half_time",
  "full_time",
  "et_start",
  "et_half",
  "et_end",
]);

export { LEAD_MINUTES, msPerMinute, PEN_MS, SOLO_BANDS };

type Ok = { ok: true; state: FootballState; events: GameEvent[] };
const ok = (state: FootballState, events: GameEvent[] = []): Ok => ({ ok: true, state, events });
const err = (error: RuleErrorCode) => ({ ok: false as const, error });

const cloneState = (s: FootballState): FootballState =>
  JSON.parse(JSON.stringify(s)) as FootballState;

export function createFootballGame(
  dataset: FootballDataset,
): GameDefinition<FootballState, FootballAction, FootballView, FootballRules> {
  const pool: Pool = makePool(dataset);
  const get = lookupOf(pool);
  const draftRng = (s: FootballState, seat: number, pick: number) =>
    seededRng(`${s.seed}:draft:${seat}:${pick}`);
  const matchStreams =
    (s: FootballState, f: Fixture): Streams =>
    (key) =>
      seededRng(`${s.seed}:match:${f.id}:${key}`);

  // ---- The draft ----

  /** The next starting slot to fill: slot order, skipping the captain's. */
  const nextSlot = (m: Manager) =>
    formation(m.formation as number).slots.findIndex((_, i) => m.xi[i] === undefined);

  function offerFor(s: FootballState, seat: number, rules: FootballRules): Offer | null {
    const m = s.managers[seat] as Manager;
    if (m.pick >= m.total) return null;
    const rng = draftRng(s, seat, m.pick);
    const L = LUCK[rules.draftLuck];
    const picked = new Set([...Object.values(m.xi), ...m.subs]);
    if (m.pick === 0)
      return { kind: "formation", ids: formationOptions(rng, rules.formationsOffered) };
    if (m.pick === 1)
      return {
        kind: "captain",
        ids: captainOptions(rng, pool, m.formation as number, L).map((p) => p.id),
      };
    if (m.pick < 12) {
      const slot = nextSlot(m);
      const pos = formation(m.formation as number).slots[slot]?.pos ?? "CM";
      return { kind: "slot", slot, ids: slotOptions(rng, pool, pos, L, picked).map((p) => p.id) };
    }
    const group = subGroups(rules.subs)[m.pick - 12] ?? "MID";
    return { kind: "sub", group, ids: subOptions(rng, pool, group, L, picked).map((p) => p.id) };
  }

  /** The default team after the draft: best known roles, default tactics. */
  function sheetFrom(m: Manager): TeamSheet {
    const slots = formation(m.formation as number).slots;
    return {
      formation: m.formation as number,
      xi: slots.map((sl, i) => {
        const id = m.xi[i] as string;
        return { id, role: bestRole(get(id), sl.pos) };
      }),
      bench: [...m.subs],
      tactics: { ...DEFAULT_TACTICS },
    };
  }

  /** The auto-pick for an offer (timeouts, bots): best fit + chemistry; captains by OVR. */
  function autoChoice(m: Manager, offer: Offer, level: "easy" | "medium" | "hard", rng: Rng) {
    if (offer.kind === "formation") return offer.ids[0] as number;
    const opts = offer.ids.map(get);
    if (level === "easy") {
      const top = [...opts].sort((a, b) => b.ovr - a.ovr).slice(0, 3);
      return (top[rng.int(top.length)] as FootballPlayer).id;
    }
    if (offer.kind === "slot") {
      const pos = formation(m.formation as number).slots[offer.slot]?.pos ?? "CM";
      return bestForSlot(opts, pos, placedXi(m.formation as number, m.xi, pool)).id;
    }
    return highestOvr(opts).id;
  }

  function pick(
    s: FootballState,
    seat: number,
    choice: string | number,
    slot: number | undefined,
    rules: FootballRules,
    now: number,
    ev: GameEvent[],
  ) {
    const m = s.managers[seat] as Manager;
    const offer = m.offer;
    if (!offer) return "NOT_ALLOWED" as const;
    if (offer.kind === "formation") {
      if (typeof choice !== "number" || !offer.ids.includes(choice)) return "BAD_ACTION" as const;
      m.formation = choice;
    } else {
      if (typeof choice !== "string" || !offer.ids.includes(choice)) return "BAD_ACTION" as const;
      if (offer.kind === "captain") {
        const fits = captainSlots(m.formation as number, get(choice));
        const at = slot !== undefined && fits.includes(slot) ? slot : fits[0];
        if (at === undefined) return "BAD_ACTION" as const;
        m.xi[at] = choice;
      } else if (offer.kind === "slot") m.xi[offer.slot] = choice;
      else m.subs.push(choice);
    }
    m.pick++;
    m.offer = offerFor(s, seat, rules);
    ev.push({ type: "pick_made", seat }); // no ids: the picks are hidden
    if (m.pick >= m.total) {
      m.sheet = sheetFrom(m);
      m.ready = false;
      m.deadline = now + rules.arrangeSeconds * 1000;
      ev.push({ type: "draft_done", seat });
    } else m.deadline = now + rules.turnSeconds * 1000;
    return null;
  }

  // ---- Fixtures and matches ----

  const sheetOfTeam = (s: FootballState, t: Team): TeamSheet =>
    "seat" in t
      ? ((s.managers[t.seat] as Manager).sheet as TeamSheet)
      : (s.bots[t.bot] as BotTeam).sheet;

  function soloBot(s: FootballState, round: number): BotTeam {
    const target = SOLO_BANDS[Math.min(round, SOLO_BANDS.length - 1)] as number;
    const lucks: Luck[] = [
      { tiers: [0, 1, 6, 8, 4], legend: 0.02, wonderkid: 1, floor: 74, jackpot: 0 },
      { tiers: [1, 5, 11, 12, 6], legend: 0.06, wonderkid: 1.3, floor: 80, jackpot: 20 },
      { tiers: [5, 8, 8, 2, 0], legend: 0.05, wonderkid: 1, floor: 84, jackpot: 30 },
      { tiers: [10, 8, 2, 0, 0], legend: 0.4, wonderkid: 1, floor: 86, jackpot: 60 },
    ];
    let best: ReturnType<typeof autoDraft> | null = null;
    for (let t = 0; t < 240; t++) {
      const L = lucks[Math.min(lucks.length - 1, round + (t % 2))] as Luck;
      const team = autoDraft((k) => seededRng(`${s.seed}:solo:${round}:${t}:${k}`), pool, L, 7);
      if (!best || Math.abs(team.rating - target) < Math.abs(best.rating - target)) best = team;
      if (Math.abs(team.rating - target) <= 1) break;
    }
    const b = best as ReturnType<typeof autoDraft>;
    const slots = formation(b.formation).slots;
    const tactics = Object.values(SHOUTS)[round % 4] ?? DEFAULT_TACTICS;
    return {
      name: BOT_NAMES[(round + s.seed.charCodeAt(0)) % BOT_NAMES.length] as string,
      rating: b.rating,
      sheet: {
        formation: b.formation,
        xi: slots.map((sl, i) => ({
          id: b.xi[i] as string,
          role: bestRole(get(b.xi[i] as string), sl.pos),
        })),
        bench: [...b.subs],
        tactics: { ...tactics },
      },
    };
  }

  /** The fixtures of round `r` (built when the round starts). */
  function buildRound(s: FootballState, r: number): Fixture[] {
    const n = s.managers.length;
    const fx = (a: Team, b: Team | "bye", knockout: boolean, k: number): Fixture => ({
      id: `r${r}m${k}`,
      a,
      b,
      knockout,
      match: null,
      log: [],
      halfFrom: 0,
      base: null,
      startedAt: 0,
      result: null,
    });
    switch (s.mode) {
      case "solo": {
        s.bots.push(soloBot(s, r));
        return [fx({ seat: 0 }, { bot: s.bots.length - 1 }, true, 0)];
      }
      case "h2h_single":
      case "h2h_bo3":
        return [fx({ seat: 0 }, { seat: 1 }, true, 0)];
      case "league": {
        const rr = roundRobinFor(n)[r] ?? [];
        return rr.map((p, k) => fx({ seat: p.a }, p.b === "bye" ? "bye" : { seat: p.b }, false, k));
      }
      case "knockout": {
        if (r === 0) {
          const pairs = bracketFor(s, n);
          return pairs.map((p, k) =>
            fx({ seat: p.a }, p.b === "bye" ? "bye" : { seat: p.b }, true, k),
          );
        }
        // Winners of the last round, paired in bracket order.
        const prev = s.rounds[r - 1] ?? [];
        const through = prev.map(fixtureWinner).filter((x): x is number => x !== null);
        const out: Fixture[] = [];
        for (let i = 0; i < through.length; i += 2) {
          const a = through[i] as number;
          const b = through[i + 1];
          out.push(fx({ seat: a }, b === undefined ? "bye" : { seat: b }, true, i / 2));
        }
        return out;
      }
    }
  }

  const rrCache = new Map<number, ReturnType<typeof roundRobinImpl>>();
  const roundRobinFor = (n: number) => {
    if (!rrCache.has(n)) rrCache.set(n, roundRobinImpl(n));
    return rrCache.get(n) as ReturnType<typeof roundRobinImpl>;
  };
  const bracketFor = (s: FootballState, n: number) =>
    bracketImpl(n, seededRng(`${s.seed}:bracket`));

  /** The seat that went through (bye or win), or null (a bot won, or not decided). */
  function fixtureWinner(f: Fixture): number | null {
    if (f.b === "bye") return "seat" in f.a ? f.a.seat : null;
    if (!f.result || f.result.winner === "draw") return null;
    const t = f.result.winner === 0 ? f.a : f.b;
    return "seat" in t ? t.seat : null;
  }

  function kickoff(s: FootballState, rules: FootballRules, now: number, ev: GameEvent[]) {
    // The last round's logs are no longer needed once a new one starts (keeps the state small).
    for (const f of s.rounds.flat()) {
      f.log = [];
      f.match = null;
    }
    const fixtures = buildRound(s, s.round);
    s.rounds[s.round] = fixtures;
    for (const f of fixtures) {
      if (f.b === "bye") {
        f.result = { score: [0, 0], pens: null, winner: 0 };
        continue;
      }
      const m0 = startMatch(sheetOfTeam(s, f.a), sheetOfTeam(s, f.b), {
        knockout: f.knockout,
        chemistry: rules.chemistry,
        subsPerMatch: rules.subsPerMatch,
      });
      const h = startHalf(m0, matchStreams(s, f));
      f.match = h.state;
      f.base = JSON.parse(JSON.stringify(h.state.stats)) as MatchState["stats"];
      f.log = [...h.events];
      f.startedAt = now;
      ev.push({ type: "teams_revealed", fixture: f.id });
    }
    s.phase = "live";
    s.windowEndsAt = null;
    for (const m of s.managers) m.ready = true;
    ev.push({ type: "half_started", round: s.round, half: 1 });
  }

  /** Plays every live match up to the playback clock + the lead. */
  function tick(s: FootballState, rules: FootballRules, now: number, ev: GameEvent[]) {
    const per = msPerMinute(rules);
    for (const f of s.rounds[s.round] ?? []) {
      const m = f.match;
      if (!m || m.halfDone || isFinished(m)) continue;
      // Bot XIs (solo run) make their own touchline decisions.
      if (f.b !== "bye" && "bot" in f.b) {
        const c = botChange(m, 1, null);
        if (c && !whyNotChange(m, 1, c)) f.match = applyChange(m, 1, c).state;
      }
      const target = Math.floor((now - f.startedAt) / per) + LEAD_MINUTES;
      const r = playMinutes(f.match as MatchState, target, matchStreams(s, f), get);
      f.match = r.state;
      f.log.push(...r.events);
      for (const e of r.events)
        if (e.t === "goal") ev.push({ type: "goal", fixture: f.id, team: e.team });
    }
    const live = (s.rounds[s.round] ?? []).filter((f) => f.match && !isFinished(f.match));
    if (live.some((f) => !(f.match as MatchState).halfDone)) return;
    // Every half in this round is over: a break, or the end of the round.
    if (live.length) {
      s.phase = "break";
      const lag = (LEAD_MINUTES + PLAYBACK_SLACK_MINUTES) * per;
      s.windowEndsAt = now + lag + rules.halfTimeSeconds * 1000;
      const inPlay = new Set(
        live.flatMap((f) =>
          teamsOf(f)
            .filter((t): t is { seat: number } => "seat" in t)
            .map((t) => t.seat),
        ),
      );
      s.managers.forEach((m, i) => (m.ready = !inPlay.has(i)));
      ev.push({ type: "half_time", round: s.round });
    } else {
      // Over here, but still playing on screens: end the round once the last minute is shown.
      s.roundEndsAt ??= Math.max(now, ...(s.rounds[s.round] ?? []).map((f) => playbackEnd(f, per)));
      if (now < s.roundEndsAt) return;
      s.roundEndsAt = null;
      endRound(s, rules, now, ev);
    }
  }

  /** When the screens finish showing a fixture's current half (or shoot-out). */
  function playbackEnd(f: Fixture, per: number): number {
    const seg = f.log.slice(f.halfFrom ?? 0);
    const pens = seg.filter((e) => e.t === "pen").length;
    if (pens) return f.startedAt + (pens + 1) * PEN_MS + 600;
    const minutes = seg.filter((e) => e.t === "ball").length;
    // Busy minutes play slower on screen and quiet ones catch up (`playback.ts`): allow the slack.
    return f.startedAt + (minutes + 1) * per + PLAYBACK_SLACK_MINUTES * per + 600;
  }

  const teamsOf = (f: Fixture): Team[] => (f.b === "bye" ? [f.a] : [f.a, f.b]);

  /** After a break: the next half (or extra time, or the shoot-out) where a match needs one. */
  function resume(s: FootballState, rules: FootballRules, now: number, ev: GameEvent[]) {
    let anyHalf = false;
    let pensUntil = now;
    for (const f of s.rounds[s.round] ?? []) {
      const m = f.match;
      if (!m || isFinished(m)) continue;
      const next = nextPhase(m);
      if (next === "half") {
        const r = startHalf(m, matchStreams(s, f));
        f.match = r.state;
        f.base = JSON.parse(JSON.stringify(m.stats)) as MatchState["stats"];
        f.halfFrom = f.log.length;
        f.log.push(...r.events);
        f.startedAt = now;
        anyHalf = true;
      } else if (next === "penalties") {
        const r = shootout(m, matchStreams(s, f), get);
        f.match = r.state;
        f.base = JSON.parse(JSON.stringify(m.stats)) as MatchState["stats"];
        f.halfFrom = f.log.length;
        f.log.push(...r.events);
        f.startedAt = now;
        pensUntil = Math.max(pensUntil, now + r.events.length * PEN_MS);
      }
    }
    s.phase = "live";
    s.windowEndsAt = null;
    for (const m of s.managers) m.ready = true;
    ev.push({ type: "half_started", round: s.round });
    // Only shoot-outs left: the round ends once they've been shown (ticks carry on until then).
    if (!anyHalf) s.roundEndsAt = pensUntil + 600;
  }

  function result(f: Fixture) {
    const m = f.match as MatchState;
    const w = winner(m);
    f.result = {
      score: [m.score[0], m.score[1]],
      pens: m.pens ? [m.pens.tally[0], m.pens.tally[1]] : null,
      winner: w === null ? "draw" : w,
    };
  }

  function endRound(s: FootballState, rules: FootballRules, now: number, ev: GameEvent[]) {
    const fixtures = s.rounds[s.round] ?? [];
    for (const f of fixtures) if (f.match && !f.result) result(f);
    // Tables, series, the run.
    if (s.mode === "league")
      for (const f of fixtures) {
        if (f.b === "bye" || !f.result || !("seat" in f.a) || !("seat" in f.b)) continue;
        const [ga, gb] = f.result.score;
        addRow(s.table, f.a.seat, ga, gb);
        addRow(s.table, f.b.seat, gb, ga);
      }
    if (s.mode === "h2h_bo3") {
      const w = fixtures[0]?.result?.winner;
      if (w === 0 || w === 1) s.series[w]++;
    }
    ev.push({ type: "round_done", round: s.round });
    const nextRound = () => {
      s.round++;
      s.phase = "between";
      // The last minutes have been shown by now (roundEndsAt), so no lag to allow for.
      s.windowEndsAt = now + rules.betweenMatchesSeconds * 1000;
      s.managers.forEach((m) => (m.ready = false));
    };
    switch (s.mode) {
      case "h2h_single":
        return finish(s, ev);
      case "h2h_bo3":
        return s.series[0] >= 2 || s.series[1] >= 2 || s.round >= 2 ? finish(s, ev) : nextRound();
      case "solo": {
        const won = fixtures[0]?.result?.winner === 0;
        if (!won || s.round >= SOLO_BANDS.length - 1) {
          ev.push({ type: "run_over", wins: s.round + (won ? 1 : 0) });
          return finish(s, ev);
        }
        return nextRound();
      }
      case "league":
        return s.round >= roundRobinFor(s.managers.length).length - 1 ? finish(s, ev) : nextRound();
      case "knockout": {
        const through = fixtures.map(fixtureWinner).filter((x) => x !== null);
        return through.length <= 1 ? finish(s, ev) : nextRound();
      }
    }
  }

  function addRow(table: TableRow[], seat: number, gf: number, ga: number) {
    const row = table.find((r) => r.seat === seat) as TableRow;
    row.p++;
    row.gf += gf;
    row.ga += ga;
    if (gf > ga) {
      row.w++;
      row.pts += 3;
    } else if (gf === ga) {
      row.d++;
      row.pts += 1;
    } else row.l++;
  }

  function finish(s: FootballState, ev: GameEvent[]) {
    s.phase = "over";
    s.windowEndsAt = null;
    s.places = places(s);
    ev.push({ type: "over" });
  }

  function places(s: FootballState): SeatIndex[][] {
    const n = s.managers.length;
    if (s.mode === "solo") return [[0]];
    if (s.mode === "h2h_single" || s.mode === "h2h_bo3") {
      const w =
        s.mode === "h2h_bo3"
          ? s.series[0] === s.series[1]
            ? "draw"
            : s.series[0] > s.series[1]
              ? 0
              : 1
          : (s.rounds[0]?.[0]?.result?.winner ?? "draw");
      return w === "draw" ? [[0, 1]] : [[w], [1 - w]];
    }
    if (s.mode === "league") {
      const flip = new Map(
        s.table.map((r) => [r.seat, seededRng(`${s.seed}:flip:${r.seat}`).int(1000)]),
      );
      const sorted = [...s.table].sort(
        (a, b) =>
          b.pts - a.pts ||
          b.gf - b.ga - (a.gf - a.ga) ||
          b.gf - a.gf ||
          (flip.get(a.seat) ?? 0) - (flip.get(b.seat) ?? 0),
      );
      return sorted.map((r) => [r.seat]);
    }
    // Knockout: the winner, then by the round each manager went out in (later is better).
    const outIn = new Map<number, number>();
    s.rounds.forEach((round, r) =>
      round.forEach((f) => {
        if (f.b === "bye" || !f.result) return;
        const loser = f.result.winner === 0 ? f.b : f.a;
        if ("seat" in loser) outIn.set(loser.seat, r);
      }),
    );
    const champ = Array.from({ length: n }, (_, i) => i).filter((i) => !outIn.has(i));
    const byRound = [...new Set([...outIn.values()])].sort((a, b) => b - a);
    return [
      champ,
      ...byRound.map((r) => [...outIn.entries()].filter(([, x]) => x === r).map(([k]) => k)),
    ].filter((g) => g.length);
  }

  // ---- Changes: before kickoff, at breaks, between matches, and live ----

  /** The fixture a seat is playing now (this round), if any. */
  const fixtureOf = (s: FootballState, seat: number) =>
    (s.rounds[s.round] ?? []).find((f) => teamsOf(f).some((t) => "seat" in t && t.seat === seat));
  const sideOf = (f: Fixture, seat: number): Side => ("seat" in f.a && f.a.seat === seat ? 0 : 1);

  /** Turns a swap into a match change (bench ↔ pitch = a substitution). */
  function swapChange(m: MatchState, side: Side, a: SlotRef, b: SlotRef): Change | null {
    const t = m.teams[side];
    if ("slot" in a && "slot" in b) return { type: "swap", a: a.slot, b: b.slot };
    const slot = "slot" in a ? a : "slot" in b ? b : null;
    const bench = "bench" in a ? a : "bench" in b ? b : null;
    if (!slot || !bench) return null;
    const off = t.xi[slot.slot]?.id;
    const on = t.bench[bench.bench];
    return off && on ? { type: "sub", off, on } : null;
  }

  /** Edits a team sheet outside a match (before kickoff, between matches). */
  function editSheet(sheet: TeamSheet, a: FootballAction): RuleErrorCode | null {
    switch (a.type) {
      case "tactics":
        sheet.tactics = { ...a.tactics };
        return null;
      case "shout":
        sheet.tactics = { ...SHOUTS[a.shout] };
        return null;
      case "role": {
        const x = sheet.xi[a.slot];
        const pos = formation(sheet.formation).slots[a.slot]?.pos;
        if (!x || !pos || !POSITION_ROLES[pos].includes(a.role)) return "BAD_ACTION";
        x.role = a.role;
        if (a.focus) x.focus = a.focus;
        return null;
      }
      case "formation": {
        try {
          const slots = formation(a.id).slots;
          sheet.formation = a.id;
          sheet.xi = sheet.xi.map((x, i) => {
            const pos = slots[i]?.pos ?? "CM";
            return POSITION_ROLES[pos].includes(x.role)
              ? x
              : { id: x.id, role: bestRole(get(x.id), pos) };
          });
          return null;
        } catch {
          return "BAD_ACTION";
        }
      }
      case "swap": {
        const read = (r: SlotRef) => ("slot" in r ? sheet.xi[r.slot]?.id : sheet.bench[r.bench]);
        const write = (r: SlotRef, id: string) => {
          if ("slot" in r) {
            const pos = formation(sheet.formation).slots[r.slot]?.pos ?? "CM";
            sheet.xi[r.slot] = { id, role: bestRole(get(id), pos) };
          } else sheet.bench[r.bench] = id;
        };
        const x = read(a.a);
        const y = read(a.b);
        if (!x || !y) return "BAD_ACTION";
        write(a.a, y);
        write(a.b, x);
        return null;
      }
      default:
        return "BAD_ACTION";
    }
  }

  /** A live (or break) change to a match. */
  function liveChange(
    s: FootballState,
    seat: number,
    a: FootballAction,
    now: number,
    ev: GameEvent[],
  ): RuleErrorCode | null {
    const f = fixtureOf(s, seat);
    const m = f?.match;
    if (!f || !m || isFinished(m)) return "NOT_ALLOWED";
    const mgr = s.managers[seat] as Manager;
    if (s.phase === "live" && now - mgr.lastChange < CHANGE_GAP_MS) return "NOT_ALLOWED";
    const side = sideOf(f, seat);
    let c: Change | null = null;
    if (a.type === "tactics") c = { type: "tactics", tactics: a.tactics };
    else if (a.type === "shout") c = { type: "tactics", tactics: { ...SHOUTS[a.shout] } };
    else if (a.type === "role") {
      const pos = formation(m.teams[side].formation).slots[a.slot]?.pos;
      if (!pos || !POSITION_ROLES[pos].includes(a.role)) return "BAD_ACTION";
      c = { type: "role", slot: a.slot, role: a.role, ...(a.focus ? { focus: a.focus } : {}) };
    } else if (a.type === "formation") c = { type: "formation", formation: a.id };
    else if (a.type === "swap") c = swapChange(m, side, a.a, a.b);
    if (!c || whyNotChange(m, side, c)) return "NOT_ALLOWED";
    const r = applyChange(m, side, c);
    f.match = r.state;
    f.log.push(...r.events);
    mgr.lastChange = now;
    if (a.type === "tactics" || a.type === "shout")
      (mgr.sheet as TeamSheet).tactics = { ...r.state.teams[side].tactics };
    ev.push({ type: "change", fixture: f.id, team: side });
    return null;
  }

  /** Simple touchline rules for bots (tactics.md → Half-time): chase a game, protect a lead, freshen legs. */
  function botChange(m: MatchState, side: Side, _seat: number | null): Change | null {
    if (m.half === 0 || m.halfDone) return null;
    const t = m.teams[side];
    const minute = clockMinute(m);
    const diff = m.score[side] - m.score[side === 0 ? 1 : 0];
    if (minute >= 55) {
      const tired = t.xi
        .map((x, i) => ({ x, i }))
        .filter(({ x }) => !x.off && x.fit < 55 && x.pos !== "GK");
      const sub = tired.sort((p, q) => p.x.fit - q.x.fit)[0];
      if (sub && t.subsUsed < m.subsPerMatch && t.bench.length) {
        const pos = sub.x.pos;
        const on = [...t.bench].sort(
          (p, q) =>
            get(q).ovr -
            (get(p).positions.includes(pos) ? 6 : 0) -
            (get(p).ovr - (get(q).positions.includes(pos) ? 6 : 0)),
        )[0];
        if (on) return { type: "sub", off: sub.x.id, on };
      }
    }
    const want =
      minute >= 55 && diff < 0 ? SHOUTS.attack : minute >= 65 && diff >= 2 ? SHOUTS.hold : null;
    if (want && JSON.stringify(want) !== JSON.stringify(t.tactics))
      return { type: "tactics", tactics: { ...want } };
    return null;
  }

  // ---- The definition ----

  const def: GameDefinition<FootballState, FootballAction, FootballView, FootballRules> = {
    slug: "football",
    minPlayers: 1,
    maxPlayers: 8,
    presets: { naija: footballNaija },
    ruleSchema: footballRulesSchema,
    actionSchema: footballActionSchema,

    setup(players, ctx) {
      const r = ctx.rng;
      const seed = Array.from({ length: 4 }, () => r.int(2 ** 31).toString(36)).join("");
      const total = 2 + 10 + ctx.rules.subs;
      const s: FootballState = {
        seed,
        dataVersion: dataset.version,
        msPerMinute: msPerMinute(ctx.rules),
        mode: modeFor(ctx.rules, players),
        phase: "draft",
        managers: Array.from({ length: players }, () => ({
          pick: 0,
          total,
          formation: null,
          xi: {},
          subs: [],
          offer: null,
          deadline: ctx.now + ctx.rules.turnSeconds * 1000,
          sheet: null,
          ready: false,
          lastChange: 0,
        })),
        rounds: [],
        round: 0,
        windowEndsAt: null,
        table: Array.from({ length: players }, (_, seat) => ({
          seat,
          p: 0,
          w: 0,
          d: 0,
          l: 0,
          gf: 0,
          ga: 0,
          pts: 0,
        })),
        bots: [],
        series: [0, 0],
        places: null,
      };
      s.managers.forEach((m, seat) => (m.offer = offerFor(s, seat, ctx.rules)));
      return s;
    },

    currentSeats(s) {
      if (s.phase === "draft")
        return s.managers.flatMap((m, i) => (m.pick < m.total || !m.ready ? [i] : []));
      if (s.phase === "break" || s.phase === "between")
        return s.managers.flatMap((m, i) => (m.ready ? [] : [i]));
      return [];
    },

    legalActions(s, seat) {
      const m = s.managers[seat];
      if (!m || s.phase === "over") return [];
      if (s.phase === "draft") {
        if (m.offer)
          return m.offer.ids.map((choice) => ({ type: "pick", choice }) as FootballAction);
        return m.ready ? [] : [{ type: "ready" }, { type: "shout", shout: "press" }];
      }
      if (s.phase === "live") {
        const f = fixtureOf(s, seat);
        return f?.match && !isFinished(f.match)
          ? (Object.keys(SHOUTS) as Array<keyof typeof SHOUTS>).map((shout) => ({
              type: "shout",
              shout,
            }))
          : [];
      }
      return m.ready ? [] : [{ type: "ready" }];
    },

    apply(prev, { seat, action }, ctx) {
      if (prev.phase === "over") return err("GAME_OVER");
      const s = cloneState(prev);
      const ev: GameEvent[] = [];
      const now = ctx.now;
      const rules = ctx.rules;
      const m = s.managers[seat];
      if (action.type === "tick") {
        if (s.phase !== "live") return err("NOT_ALLOWED");
        tick(s, rules, now, ev);
        return ok(s, ev);
      }
      if (!m) return err("NOT_YOUR_TURN");
      switch (action.type) {
        case "pick": {
          if (s.phase !== "draft") return err("NOT_ALLOWED");
          const e = pick(s, seat, action.choice, action.slot, rules, now, ev);
          if (e) return err(e);
          return ok(s, ev);
        }
        case "ready": {
          if (m.ready) return err("NOT_ALLOWED");
          if (s.phase === "draft") {
            if (m.pick < m.total) return err("NOT_ALLOWED");
            m.ready = true;
            m.deadline = null;
            if (s.managers.every((x) => x.pick >= x.total && x.ready)) kickoff(s, rules, now, ev);
            return ok(s, ev);
          }
          if (s.phase !== "break" && s.phase !== "between") return err("NOT_ALLOWED");
          m.ready = true;
          if (s.managers.every((x) => x.ready)) {
            if (s.phase === "break") resume(s, rules, now, ev);
            else kickoff(s, rules, now, ev);
          }
          return ok(s, ev);
        }
        case "skip": {
          if (s.mode !== "solo" || s.phase !== "live") return err("NOT_ALLOWED");
          // Solo: no one else to wait for, so the half plays out at once.
          for (const f of s.rounds[s.round] ?? []) f.startedAt = now - 200 * msPerMinute(rules);
          tick(s, rules, now, ev);
          const after = s.phase as FootballState["phase"]; // tick() moves it on
          if (after === "break" || after === "between") s.windowEndsAt = now + 1500;
          return ok(s, ev);
        }
        default: {
          // Tactics, shouts, roles, formation, swaps.
          const arranging = s.phase === "draft" && m.pick >= m.total && !m.ready;
          if (arranging || s.phase === "between") {
            const e = editSheet(m.sheet as TeamSheet, action);
            return e ? err(e) : ok(s, ev);
          }
          if (s.phase === "live" || s.phase === "break") {
            const e = liveChange(s, seat, action, now, ev);
            return e ? err(e) : ok(s, ev);
          }
          return err("NOT_ALLOWED");
        }
      }
    },

    timeoutAction(s, seat, rules, rng) {
      const m = s.managers[seat] as Manager;
      if (s.phase === "draft" && m.offer)
        return { type: "pick", choice: autoChoice(m, m.offer, "medium", rng) };
      void rules;
      return { type: "ready" };
    },

    timeoutCounts(s, seat) {
      // Running out the pick clock counts as away; letting a window run out is a normal choice.
      return s.phase === "draft" && !!s.managers[seat]?.offer;
    },

    autoAdvance(s, rules) {
      if (s.phase !== "live") return null;
      return {
        seat: 0,
        action: { type: "tick" },
        afterMs: Math.round(LEAD_MINUTES * msPerMinute(rules)),
      };
    },

    turnDeadline(s, seat) {
      const m = s.managers[seat];
      if (!m) return null;
      if (s.phase === "draft") return m.deadline;
      if ((s.phase === "break" || s.phase === "between") && !m.ready) return s.windowEndsAt;
      return null;
    },

    botReply(s, seat) {
      if (s.phase !== "live") return null;
      const f = fixtureOf(s, seat);
      const m = f?.match;
      if (!f || !m || isFinished(m)) return null;
      const side = sideOf(f, seat);
      const c = botChange(m, side, seat);
      if (!c) return null;
      if (c.type === "tactics") return { type: "tactics", tactics: c.tactics };
      if (c.type === "sub") {
        const slot = m.teams[side].xi.findIndex((x) => x.id === c.off);
        const bench = m.teams[side].bench.indexOf(c.on);
        return slot >= 0 && bench >= 0 ? { type: "swap", a: { slot }, b: { bench } } : null;
      }
      return null;
    },

    view(s, viewer) {
      const cards: Record<string, Card> = {};
      const card = (id: string) => {
        if (cards[id]) return;
        const p = pool.byId.get(id);
        if (!p) return;
        cards[id] = {
          id: p.id,
          name: p.name,
          short: p.short,
          group: p.group,
          positions: p.positions,
          ovr: p.ovr,
          stats: p.stats,
          nation: p.nation,
          club: p.club,
          league: p.league ?? null,
          era: p.era,
          potential: p.potential,
          roles: p.roles,
        };
      };
      const meM = viewer === "spectator" ? null : (s.managers[viewer] ?? null);
      let me: FootballView["me"] = null;
      if (meM) {
        const { lastChange: _l, ...rest } = meM;
        me = JSON.parse(JSON.stringify(rest)) as FootballView["me"];
        meM.offer?.ids.forEach((id) => typeof id === "string" && card(id));
        Object.values(meM.xi).forEach(card);
        meM.subs.forEach(card);
      }
      // Full detail only for the match you're in (spectators and those knocked out: the first one
      // still playing); the rest are a score line. Keeps every snapshot small on mobile data.
      const current = s.rounds[s.round] ?? [];
      const mine = viewer === "spectator" ? undefined : fixtureOf(s, viewer);
      const focus =
        (mine && mine.b !== "bye" ? mine : undefined) ??
        current.find((f) => f.match && !isFinished(f.match)) ??
        current.find((f) => f.match);
      const rounds = s.rounds.map((round) =>
        round.map((f): FixtureView => {
          const detailed = f === focus;
          const shown = detailed && (!!f.match || !!f.result);
          const sheets =
            shown && f.b !== "bye"
              ? ([sheetOfTeam(s, f.a), sheetOfTeam(s, f.b)] as [TeamSheet, TeamSheet])
              : null;
          const m = f.match;
          if (sheets)
            for (const sh of sheets) [...sh.xi.map((x) => x.id), ...sh.bench].forEach(card);
          if (m && detailed)
            for (const t of m.teams)
              [...t.xi.map((x) => x.id), ...t.bench, ...t.gone].forEach(card);
          // Your own side in this match (stamina and "tiring" lines are yours alone).
          const own =
            viewer !== "spectator" &&
            f.b !== "bye" &&
            teamsOf(f).some((t) => "seat" in t && t.seat === viewer)
              ? sideOf(f, viewer)
              : null;
          const name = (t: Team | "bye") =>
            t === "bye" ? "Bye" : "bot" in t ? (s.bots[t.bot]?.name ?? "") : "";
          return {
            id: f.id,
            a: f.a,
            b: f.b,
            names: [name(f.a), name(f.b)],
            teams: sheets,
            score: m ? [m.score[0], m.score[1]] : (f.result?.score ?? null),
            live:
              m && detailed
                ? {
                    score: [...m.score],
                    stats: m.stats,
                    half: m.half,
                    minute: m.minute,
                    length: m.length,
                    halfDone: m.halfDone,
                    subsUsed: [m.teams[0].subsUsed, m.teams[1].subsUsed],
                    base: f.base ?? m.stats,
                    now: m.teams.map((t) => ({
                      formation: t.formation,
                      xi: t.xi.map((x) => ({ id: x.id, role: x.role, focus: x.focus })),
                      bench: [...t.bench],
                      tactics: t.tactics,
                    })) as [TeamSheet, TeamSheet],
                    tactics: [m.teams[0].tactics, m.teams[1].tactics],
                    xi: [m.teams[0].xi.map((x) => x.id), m.teams[1].xi.map((x) => x.id)],
                    off: [
                      m.teams[0].xi.filter((x) => x.off).map((x) => x.id),
                      m.teams[1].xi.filter((x) => x.off).map((x) => x.id),
                    ],
                    fit:
                      own === null
                        ? null
                        : Object.fromEntries(
                            m.teams[own].xi
                              .filter((x) => !x.off)
                              .map((x) => [x.id, Math.round(x.fit)]),
                          ),
                  }
                : null,
            log: detailed
              ? f.log.filter(
                  (e, i) =>
                    (e.t !== "tired" || e.team === own) &&
                    (i >= f.halfFrom ||
                      BIG.has(e.t) ||
                      (e.t === "foul" && !!e.card && e.card !== "yellow")),
                )
              : [],
            startedAt: f.startedAt,
            result: f.result,
          };
        }),
      );
      return {
        mode: s.mode,
        phase: s.phase,
        dataVersion: s.dataVersion,
        you: viewer === "spectator" ? null : viewer,
        me,
        managers: s.managers.map((m) => ({ pick: m.pick, total: m.total, ready: m.ready })),
        rounds,
        round: s.round,
        windowEndsAt: s.windowEndsAt,
        table: s.table,
        series: s.series,
        places: s.places,
        msPerMinute: s.msPerMinute,
        focus: focus?.id ?? null,
        cards,
      };
    },

    isOver: (s) => s.phase === "over",
    ranking: (s) => s.places ?? [],

    bots: {
      easy: (s, seat, rules, rng) => botAct(s, seat, "easy", rng, rules),
      medium: (s, seat, rules, rng) => botAct(s, seat, "medium", rng, rules),
      hard: (s, seat, rules, rng) => botAct(s, seat, "hard", rng, rules),
    },
  };

  function botAct(
    s: FootballState,
    seat: number,
    level: "easy" | "medium" | "hard",
    rng: Rng,
    _rules: FootballRules,
  ): FootballAction {
    const m = s.managers[seat] as Manager;
    if (s.phase === "draft" && m.offer)
      return { type: "pick", choice: autoChoice(m, m.offer, level, rng) };
    return { type: "ready" };
  }

  return def;
}

// Local copies to keep the factory readable.
import { bracket as bracketImpl, roundRobin as roundRobinImpl } from "./schedule";
