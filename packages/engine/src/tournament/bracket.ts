// Tournament brackets (docs/16-tournaments.md): the stage plan, table draws, byes, who goes
// through, knockout rounds and final places. Pure: the Tournament Durable Object is the I/O
// around it (creating table rooms, taking their results), so whole tournaments can be played
// out in tests with random results.
import type { BotLevel, GameSlug, Rng } from "../types";

export const MIN_ENTRANTS = 4;
export const MAX_ENTRANTS = 32;
export const MAX_STAGES = 6;

/** The games a stage can use, with the table sizes each allows. */
export const STAGE_GAMES: Record<GameSlug, { name: string; min: number; max: number }> = {
  whot: { name: "Whot", min: 2, max: 8 },
  ludo: { name: "Ludo", min: 2, max: 4 },
  snakes: { name: "Snakes & Ladders", min: 2, max: 8 },
  tictactoe: { name: "Tic-tac-toe", min: 2, max: 2 },
  rps: { name: "Rock Paper Scissors", min: 2, max: 8 },
  chess: { name: "Chess", min: 2, max: 2 },
  draughts: { name: "Draft", min: 2, max: 2 },
  plots: { name: "Naija Plots", min: 2, max: 8 },
  // A solo run isn't a table: football tables have at least two managers.
  football: { name: "Football Draft", min: 2, max: 8 },
};

export type StageSpec = {
  game: GameSlug;
  /** That game's rules sheet (validated by the game, opaque here). */
  rules: unknown;
  /** Players per table. 2 makes it a knockout stage of one-on-one matches. */
  tableSize: number;
  /**
   * Tables of 3 or more: how many go through from each full table. Knockout: how many players
   * are left when the stage ends (a power of two; 1 on the last stage).
   */
  advance: number;
  /** Knockout: games per match, first to more than half (draws don't count). */
  bestOf: 1 | 3 | 5;
};

export const isKnockout = (s: Pick<StageSpec, "tableSize">) => s.tableSize === 2;
export const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));
const isPow2 = (n: number) => n >= 1 && nextPow2(n) === n;

/** Table sizes for `n` players at tables of up to `size`: as even as possible (differ by ≤ 1). */
export function spread(n: number, size: number): number[] {
  const t = Math.ceil(n / size);
  const base = Math.floor(n / t);
  const extra = n % t;
  return Array.from({ length: t }, (_, i) => base + (i < extra ? 1 : 0));
}

/** How many go through from a table of `size` (full tables `k`; smaller ones in proportion). */
export function goThrough(size: number, tableSize: number, k: number): number {
  if (size >= tableSize) return k;
  return Math.min(size - 1, Math.max(1, Math.ceil((k * size) / tableSize)));
}

/** Knockout rounds a stage plays from `n` players down to `target`. */
export function knockoutRounds(n: number, target: number): number {
  return Math.round(Math.log2(nextPow2(n) / target));
}

/**
 * Checks a stage plan for `entrants` players and projects how many are left after each stage
 * ("32 → 16 → 8 → 1"). Errors are plain sentences for the host.
 */
export function stageFlow(
  entrants: number,
  stages: readonly StageSpec[],
): { counts: number[]; errors: string[] } {
  const errors: string[] = [];
  const counts = [entrants];
  if (entrants < MIN_ENTRANTS || entrants > MAX_ENTRANTS)
    errors.push(`A tournament has ${MIN_ENTRANTS}–${MAX_ENTRANTS} players.`);
  if (!stages.length) errors.push("Add at least one stage.");
  if (stages.length > MAX_STAGES) errors.push(`At most ${MAX_STAGES} stages.`);
  let n = entrants;
  stages.forEach((s, i) => {
    if (n < 2) return;
    const g = STAGE_GAMES[s.game];
    const at = `Stage ${i + 1}`;
    const last = i === stages.length - 1;
    if (!g) {
      errors.push(`${at}: pick a game.`);
      return;
    }
    if (s.tableSize < g.min || s.tableSize > g.max)
      errors.push(
        g.min === g.max
          ? `${at}: ${g.name} is for ${g.min} players.`
          : `${at}: ${g.name} tables are ${g.min}–${g.max} players.`,
      );
    if (isKnockout(s)) {
      const target = last ? 1 : s.advance;
      if (!last && (!isPow2(target) || target < 2 || target > nextPow2(n) / 2))
        errors.push(`${at}: the knockout must leave 2, 4, 8 or 16 players, fewer than ${n}.`);
      n = target;
    } else {
      if (s.tableSize > n) errors.push(`${at}: only ${n} players are left.`);
      if (last) {
        if (s.tableSize !== n) errors.push(`${at}: the final is one table of ${n}.`);
        n = 1;
      } else {
        if (s.advance < 1 || s.advance >= s.tableSize)
          errors.push(`${at}: 1–${s.tableSize - 1} can go through from each table.`);
        n = spread(n, s.tableSize).reduce(
          (sum, size) => sum + goThrough(size, s.tableSize, s.advance),
          0,
        );
        if (n < 2) errors.push(`${at}: only one player would be left.`);
      }
    }
    counts.push(n);
  });
  if (stages.length && n !== 1 && !errors.length)
    errors.push("The last stage must end with one winner.");
  return { counts, errors };
}

// ── The bracket ──────────────────────────────────────────────────────────────

export type Entrant = {
  id: string;
  userId: string | null;
  name: string;
  avatar: string | null;
  /** A bot entrant (filled in at the start), or null for a person. */
  bot: BotLevel | null;
  /** `left`: pressed Leave; a bot plays on for them (they can't come back). */
  status: "in" | "out" | "left";
  byes: number;
  /** Where they finished at their last table (1 = won it). */
  lastFinish: number | null;
  /** A bot played (some of) their games for them. */
  playedByBot: boolean;
};

export type BracketTable = {
  /** "s2r1t3": stage 2, round 1, table 3. */
  id: string;
  stage: number;
  round: number;
  index: number;
  /** Entrant ids, in seat order. */
  seats: string[];
  status: "pending" | "running" | "done";
  /** A knockout bye: straight through, nothing to play. */
  bye?: true;
  /** Places at the table (inner arrays are ties), entrant ids. */
  ranking?: string[][];
  /** Who went through. */
  through?: string[];
  /** A tie at the cut was settled by a coin toss. */
  coin?: true;
};

export type Placement = { entrant: string; place: number; outAtStage: number | null };

export type Bracket = {
  stages: StageSpec[];
  entrants: Entrant[];
  /** The stage and (knockout) round being played. */
  stage: number;
  round: number;
  tables: BracketTable[];
  /** Who went out where: stage, round and where they finished at that table. */
  outs: Array<{ entrant: string; stage: number; round: number; finish: number }>;
  /** Set once there's a champion. */
  placements: Placement[] | null;
};

export type BracketEvent =
  | { e: "stage_started"; stage: number; round: number }
  | { e: "table_done"; table: string }
  | { e: "advanced"; entrant: string; stage: number }
  | { e: "eliminated"; entrant: string; stage: number }
  | { e: "champion"; entrant: string };

export type BracketStep = { bracket: Bracket; created: BracketTable[]; events: BracketEvent[] };

const tableId = (stage: number, round: number, index: number) =>
  `s${stage + 1}r${round + 1}t${index + 1}`;

const clone = (b: Bracket): Bracket => ({
  ...b,
  entrants: b.entrants.map((e) => ({ ...e })),
  tables: b.tables.map((t) => ({ ...t })),
  outs: [...b.outs],
  placements: b.placements ? [...b.placements] : null,
});

/** Starts the first stage. Entrants are already complete (bots filled in). */
export function startBracket(
  entrants: Entrant[],
  stages: StageSpec[],
  rng: Rng,
): { ok: true; step: BracketStep } | { ok: false; errors: string[] } {
  const { errors } = stageFlow(entrants.length, stages);
  if (errors.length) return { ok: false, errors };
  const b: Bracket = {
    stages,
    entrants: entrants.map((e) => ({ ...e, status: "in", byes: 0, lastFinish: null })),
    stage: 0,
    round: 0,
    tables: [],
    outs: [],
    placements: null,
  };
  const step: BracketStep = { bracket: b, created: [], events: [] };
  drawStage(
    step,
    b.entrants.map((e) => e.id),
    rng,
  );
  return { ok: true, step };
}

/** Who sat together at the previous stage's tables (for avoiding rematches). */
function previousTables(b: Bracket): Map<string, string> {
  const prev = new Map<string, string>();
  for (const t of b.tables)
    if (t.stage === b.stage - 1 && !t.bye) for (const id of t.seats) prev.set(id, t.id);
  return prev;
}

/** Pairs of people who sat at the same table last stage and would again. */
function rematches(groups: string[][], prev: Map<string, string>): number {
  let n = 0;
  for (const g of groups)
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const a = prev.get(g[i] as string);
        if (a !== undefined && a === prev.get(g[j] as string)) n++;
      }
  return n;
}

/** A random draw into groups of the given sizes, reshuffled once if that avoids rematches. */
function draw(ids: string[], sizes: number[], prev: Map<string, string>, rng: Rng): string[][] {
  const cut = (order: string[]) => {
    let at = 0;
    return sizes.map((s) => order.slice(at, (at += s)));
  };
  const first = cut(rng.shuffle(ids));
  if (!rematches(first, prev)) return first;
  const second = cut(rng.shuffle(ids));
  return rematches(second, prev) < rematches(first, prev) ? second : first;
}

/** The byes for a knockout's first round: fewest byes so far, people before bots, best last finish. */
export function pickByes(players: Entrant[], count: number, rng: Rng): string[] {
  return rng
    .shuffle(players)
    .map((p, k) => ({ p, k }))
    .sort(
      (x, y) =>
        x.p.byes - y.p.byes ||
        Number(!!x.p.bot) - Number(!!y.p.bot) ||
        (x.p.lastFinish ?? 99) - (y.p.lastFinish ?? 99) ||
        x.k - y.k,
    )
    .slice(0, count)
    .map(({ p }) => p.id);
}

/** Draws the current stage's first round for `ids`. */
function drawStage(step: BracketStep, ids: string[], rng: Rng) {
  const b = step.bracket;
  const s = b.stages[b.stage] as StageSpec;
  const prev = previousTables(b);
  b.round = 0;
  step.events.push({ e: "stage_started", stage: b.stage, round: 0 });
  if (!isKnockout(s)) {
    draw(ids, spread(ids.length, s.tableSize), prev, rng).forEach((seats, index) =>
      addTable(step, { seats, index }),
    );
    return;
  }
  // Knockout: byes first so every later round is a power of two.
  const slots = nextPow2(ids.length) / 2;
  const byes = pickByes(
    b.entrants.filter((e) => ids.includes(e.id)),
    slots * 2 - ids.length,
    rng,
  );
  const rest = ids.filter((id) => !byes.includes(id));
  const pairs = draw(
    rest,
    Array.from({ length: rest.length / 2 }, () => 2),
    prev,
    rng,
  );
  // Spread the byes through the bracket so they don't all meet each other next round.
  let bi = 0;
  let pi = 0;
  for (let index = 0; index < slots; index++) {
    const isBye =
      Math.floor(((index + 1) * byes.length) / slots) > Math.floor((index * byes.length) / slots);
    if (isBye) {
      const id = byes[bi++] as string;
      const entrant = b.entrants.find((e) => e.id === id) as Entrant;
      entrant.byes++;
      const t: BracketTable = {
        id: tableId(b.stage, 0, index),
        stage: b.stage,
        round: 0,
        index,
        seats: [id],
        status: "done",
        bye: true,
        ranking: [[id]],
        through: [id],
      };
      b.tables.push(t);
    } else addTable(step, { seats: pairs[pi++] as string[], index });
  }
}

function addTable(step: BracketStep, o: { seats: string[]; index: number }) {
  const b = step.bracket;
  const t: BracketTable = {
    id: tableId(b.stage, b.round, o.index),
    stage: b.stage,
    round: b.round,
    index: o.index,
    seats: o.seats,
    status: "pending",
  };
  b.tables.push(t);
  step.created.push(t);
}

/** The tables have been set up (their rooms exist). */
export function markRunning(b: Bracket, ids: readonly string[]): Bracket {
  const out = clone(b);
  for (const t of out.tables)
    if (ids.includes(t.id) && t.status === "pending") t.status = "running";
  return out;
}

/**
 * A table's result. `ranking`: entrant ids by place, ties grouped (a knockout match still level
 * after its decider is a tie). Returns null for an unknown or already reported table (a report
 * arriving twice is ignored).
 */
export function reportTable(
  b0: Bracket,
  id: string,
  ranking: string[][],
  rng: Rng,
): BracketStep | null {
  const t0 = b0.tables.find((t) => t.id === id);
  if (!t0 || t0.status === "done" || b0.placements) return null;
  // Everyone at the table exactly once, nobody else.
  const flat = ranking.flat();
  if (flat.length !== t0.seats.length || !t0.seats.every((s) => flat.includes(s))) return null;
  const b = clone(b0);
  const t = b.tables.find((x) => x.id === id) as BracketTable;
  const step: BracketStep = { bracket: b, created: [], events: [] };
  const s = b.stages[t.stage] as StageSpec;
  const last = t.stage === b.stages.length - 1;
  const knockout = isKnockout(s);
  // How many go through from here: a knockout match 1; the final table 1 (the champion).
  const k = knockout || last ? 1 : goThrough(t.seats.length, s.tableSize, s.advance);

  // Finishing order, with any tie across the cut settled by a coin toss.
  const order: Array<{ id: string; finish: number }> = [];
  for (const group of ranking) {
    const finish = order.length + 1;
    const straddles = order.length < k && order.length + group.length > k;
    const g = straddles ? rng.shuffle(group) : group;
    if (straddles) t.coin = true;
    g.forEach((gid, j) => order.push({ id: gid, finish: straddles ? finish + j : finish }));
  }
  t.status = "done";
  t.ranking = ranking.map((g) => [...g]);
  t.through = order.slice(0, k).map((o) => o.id);
  step.events.push({ e: "table_done", table: t.id });
  for (const o of order) {
    const e = b.entrants.find((x) => x.id === o.id) as Entrant;
    e.lastFinish = o.finish;
    if (t.through.includes(o.id)) {
      if (!last || knockout) step.events.push({ e: "advanced", entrant: o.id, stage: t.stage });
    } else {
      if (e.status === "in") e.status = "out";
      b.outs.push({ entrant: o.id, stage: t.stage, round: t.round, finish: o.finish });
      step.events.push({ e: "eliminated", entrant: o.id, stage: t.stage });
    }
  }
  if (b.tables.some((x) => x.stage === b.stage && x.round === b.round && x.status !== "done"))
    return step;
  roundDone(step, rng);
  return step;
}

/** Everyone in the current round has finished: the next round, the next stage, or the end. */
function roundDone(step: BracketStep, rng: Rng) {
  const b = step.bracket;
  const s = b.stages[b.stage] as StageSpec;
  const tables = b.tables
    .filter((x) => x.stage === b.stage && x.round === b.round)
    .sort((x, y) => x.index - y.index);
  const through = tables.flatMap((x) => x.through ?? []);
  const last = b.stage === b.stages.length - 1;
  const target = last ? 1 : s.advance;
  if (isKnockout(s) && through.length > target) {
    // Next knockout round: winners of tables 1 and 2 meet, 3 and 4, and so on.
    b.round++;
    step.events.push({ e: "stage_started", stage: b.stage, round: b.round });
    for (let i = 0; i < through.length / 2; i++)
      addTable(step, { seats: [through[2 * i] as string, through[2 * i + 1] as string], index: i });
    return;
  }
  if (last) {
    const champ = through[0] as string;
    step.events.push({ e: "champion", entrant: champ });
    b.placements = placements(b, champ);
    return;
  }
  b.stage++;
  drawStage(step, through, rng);
}

/**
 * Final places: the champion first; then whoever went out latest (later stage, later knockout
 * round), and within that by where they finished at their table. People level on all of that
 * share a place ("=5th").
 */
function placements(b: Bracket, champion: string): Placement[] {
  const lastStage = b.stages.length - 1;
  const outs = [...b.outs].sort(
    (x, y) => y.stage - x.stage || y.round - x.round || x.finish - y.finish,
  );
  const out: Placement[] = [{ entrant: champion, place: 1, outAtStage: null }];
  outs.forEach((o, i) => {
    const prev = outs[i - 1];
    const tied =
      prev && prev.stage === o.stage && prev.round === o.round && prev.finish === o.finish;
    out.push({
      entrant: o.entrant,
      place: tied ? (out[out.length - 1] as Placement).place : i + 2,
      outAtStage: o.stage === lastStage ? null : o.stage,
    });
  });
  return out;
}

/** The table an entrant is playing at (or waiting for) now, if any. */
export function currentTable(b: Bracket, entrant: string): BracketTable | null {
  return b.tables.find((t) => t.status !== "done" && t.seats.includes(entrant)) ?? null;
}
