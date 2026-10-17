// The Tournament Durable Object (docs/16-tournaments.md): one per tournament, named by its
// 7-letter code. It holds the lobby, the bracket (the engine's pure `bracket.ts` does the
// thinking), creates each table as an ordinary GameRoom, takes their results, sends players on
// to their next table, and posts the final standings to web once. One row, like the rooms.
import { seededRng } from "@gamehub/engine";
import {
  currentTable,
  markRunning,
  reportTable,
  STAGE_GAMES,
  stageFlow,
  startBracket,
  type Bracket,
  type BracketEvent,
  type BracketTable,
  type Entrant,
} from "@gamehub/engine/tournament";
import {
  clientTournamentMsg,
  CloseCode,
  createTournamentRequest,
  MAX_FRAME_BYTES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  tournamentCodeSchema,
  type BotLevel,
  type ClientTournamentMsg,
  type EntrantPublic,
  type ServerTournamentMsg,
  type TableInit,
  type TableReport,
  type TicketClaims,
  type TournamentConfig,
  type TournamentErrorCode,
  type TournamentMatch,
  type TournamentPhase,
  type TournamentPublic,
  type TournamentResult,
} from "@gamehub/protocol";
import { signBody } from "@gamehub/protocol/hmac";
import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { CLAIMS_HEADER } from "../rooms/game-room";
import { gameFor } from "../rooms/games";

/** A lobby nobody touches for this long is cancelled. */
const LOBBY_IDLE_MS = 30 * 60_000;
/** A finished tournament stays viewable this long (results are in web by then). */
const FINISHED_KEEP_MS = 24 * 60 * 60_000;
/** Posting the results to web: retries back off to this, then give up after `MAX_POSTS`. */
const MAX_POST_GAP_MS = 10 * 60_000;
const MAX_POSTS = 12;

type Person = { userId: string; name: string; avatar: string | null };

type TourRec = {
  id: string;
  code: string;
  hostUserId: string;
  config: TournamentConfig;
  phase: TournamentPhase;
  /** People in the lobby, in the order they joined (the host first). */
  joined: Person[];
  bracket: Bracket | null;
  /** Table id → its room code, once created. */
  rooms: Record<string, string>;
  /** Tables whose room couldn't be created yet (retried from the alarm). */
  pending: string[];
  matches: TournamentMatch[];
  /** Football squads by entrant, drafted at the first football stage. */
  squads: Record<string, unknown>;
  rngSeed: string;
  rngCounter: number;
  v: number;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  posted: boolean;
  posts: number;
  deadlines: { idle?: number; init?: number; post?: number; purge?: number };
};

type ConnState = Person;

function randomHex(bytes: number) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

const levelName = (l: BotLevel) => `${l.charAt(0).toUpperCase()}${l.slice(1)}`;

/** "Final", "Semi-final"… for a knockout round of `players`. */
function roundName(players: number): string {
  if (players <= 2) return "Final";
  if (players <= 4) return "Semi-final";
  if (players <= 8) return "Quarter-final";
  return `Round of ${players}`;
}

/** Checks every stage's rules against its game; returns the plan's problems in words. */
export function checkConfig(c: TournamentConfig, entrants = c.entrants): string[] {
  const errors: string[] = [];
  c.stages.forEach((s, i) => {
    const def = gameFor(s.game);
    if (!def || !def.ruleSchema.safeParse(s.rules ?? def.presets.naija).success)
      errors.push(`Stage ${i + 1}: those rules don't look right.`);
  });
  return [...errors, ...stageFlow(entrants, c.stages).errors];
}

export class Tournament extends Server<Env> {
  static override options = { hibernate: true };

  private t: TourRec | null = null;
  private lastAlarm: number | null = null;
  private buckets = new Map<string, { tokens: number; at: number }>();

  override onStart() {
    const sql = this.ctx.storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS tournament (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)",
    );
    const row = sql.exec<{ json: string }>("SELECT json FROM tournament WHERE id = 1").toArray()[0];
    this.t = row ? (JSON.parse(row.json) as TourRec) : null;
  }

  private async persist() {
    const t = this.t;
    if (!t) return;
    this.ctx.storage.sql.exec(
      "INSERT INTO tournament (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
      JSON.stringify(t),
    );
    const d = t.deadlines;
    const times = [d.idle, d.init, d.post, d.purge].filter(
      (x): x is number => typeof x === "number",
    );
    const next = times.length ? Math.min(...times) : null;
    if (next === null) {
      if (this.lastAlarm !== null) await this.ctx.storage.deleteAlarm();
      this.lastAlarm = null;
    } else if (this.lastAlarm === null || next < this.lastAlarm) {
      await this.ctx.storage.setAlarm(next);
      this.lastAlarm = next;
    }
  }

  private async commit() {
    const t = this.t;
    if (!t) return;
    t.v++;
    if (t.phase === "lobby") t.deadlines.idle = Date.now() + LOBBY_IDLE_MS;
    await this.persist();
    this.broadcastSnapshots();
  }

  private async destroy() {
    for (const c of this.getConnections()) c.close(CloseCode.RoomGone, "tournament closed");
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.t = null;
    this.lastAlarm = null;
  }

  // ── Internal HTTP (from the Worker and from table rooms) ──────────────────

  override async onRequest(req: Request): Promise<Response> {
    const internal = req.method === "POST" ? req.headers.get("x-gh-internal") : null;
    if (internal === "create") return this.create(await req.json());
    if (internal === "report") return this.onReport((await req.json()) as TableReport);
    return new Response("Not found", { status: 404 });
  }

  private async create(body: unknown): Promise<Response> {
    if (this.t) return new Response("in use", { status: 409 });
    const parsed = createTournamentRequest.extend({ code: tournamentCodeSchema }).safeParse(body);
    if (!parsed.success) return new Response("bad request", { status: 400 });
    const { config, host, code } = parsed.data;
    const errors = checkConfig(config);
    if (errors.length) return Response.json({ errors }, { status: 400 });
    const now = Date.now();
    this.t = {
      id: `t_${randomHex(10)}`,
      code,
      hostUserId: host.userId,
      config,
      phase: "lobby",
      joined: [{ userId: host.userId, name: host.name, avatar: host.avatar }],
      bracket: null,
      rooms: {},
      pending: [],
      matches: [],
      squads: {},
      rngSeed: "",
      rngCounter: 0,
      v: 0,
      createdAt: now,
      startedAt: null,
      endedAt: null,
      posted: false,
      posts: 0,
      deadlines: { idle: now + LOBBY_IDLE_MS },
    };
    await this.persist();
    return new Response(null, { status: 201 });
  }

  // ── Connections ───────────────────────────────────────────────────────────

  override async onConnect(conn: Connection<ConnState>, ctx: ConnectionContext) {
    const raw = ctx.request.headers.get(CLAIMS_HEADER);
    const claims = raw ? (JSON.parse(raw) as TicketClaims) : null;
    if (!claims) return conn.close(CloseCode.Unauthorized, "unauthorized");
    if (!this.t) return conn.close(CloseCode.RoomGone, "not found");
    for (const c of this.getConnections<ConnState>())
      if (c.id !== conn.id && c.state?.userId === claims.sub)
        c.close(CloseCode.Replaced, "replaced");
    conn.setState({ userId: claims.sub, name: claims.name, avatar: claims.avatar });
    // Online dots changed for everyone.
    this.broadcastSnapshots();
  }

  override onClose(conn: Connection<ConnState>) {
    this.buckets.delete(conn.id);
    if (this.t) this.broadcastSnapshots();
  }

  private allow(conn: Connection) {
    const now = Date.now();
    const b = this.buckets.get(conn.id) ?? { tokens: 6, at: now };
    b.tokens = Math.min(6, b.tokens + ((now - b.at) / 1000) * 2);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    this.buckets.set(conn.id, b);
    return true;
  }

  override async onMessage(conn: Connection<ConnState>, message: WSMessage) {
    if (typeof message !== "string") return conn.close(1003, "text only");
    if (message.length > MAX_FRAME_BYTES) return conn.close(1009, "too big");
    if (!this.allow(conn)) return this.send(conn, { t: "error", code: "RATE_LIMIT" });
    let json: unknown;
    try {
      json = JSON.parse(message);
    } catch {
      return this.send(conn, { t: "error", code: "BAD_MESSAGE" });
    }
    const parsed = clientTournamentMsg.safeParse(json);
    if (!parsed.success) return this.send(conn, { t: "error", code: "BAD_MESSAGE" });
    const st = conn.state;
    if (!this.t || !st) return conn.close(CloseCode.RoomGone, "not found");
    const msg = parsed.data;
    if (msg.t === "ping") return this.send(conn, { t: "pong", c: msg.c, s: Date.now() });
    if (msg.t === "t_hello") {
      this.sendSnapshot(conn);
      const go = this.goFor(st.userId);
      if (go) this.send(conn, go);
      return;
    }
    const err = await this.handle(msg, st);
    if (err) this.send(conn, typeof err === "string" ? { t: "error", code: err } : err);
  }

  private async handle(
    msg: Exclude<ClientTournamentMsg, { t: "t_hello" | "ping" }>,
    me: Person,
  ): Promise<TournamentErrorCode | ServerTournamentMsg | null> {
    const t = this.t as TourRec;
    const isHost = t.hostUserId === me.userId;
    const inLobby = t.joined.findIndex((p) => p.userId === me.userId);
    switch (msg.t) {
      case "t_join": {
        if (t.phase !== "lobby") return "WRONG_PHASE";
        if (inLobby >= 0) return null;
        if (t.joined.length >= t.config.entrants) return "TOURNAMENT_FULL";
        t.joined.push({ ...me });
        await this.commit();
        if (t.config.autoStart && t.joined.length === t.config.entrants) return this.start();
        return null;
      }
      case "t_leave": {
        if (t.phase === "lobby") {
          if (inLobby < 0) return null;
          t.joined.splice(inLobby, 1);
          if (isHost) {
            const next = t.joined[0];
            if (!next) {
              t.phase = "cancelled";
              this.broadcastSnapshots();
              await this.destroy();
              return null;
            }
            t.hostUserId = next.userId;
          }
          await this.commit();
          return null;
        }
        if (t.phase !== "running" || !t.bracket) return "WRONG_PHASE";
        const e = t.bracket.entrants.find((x) => x.userId === me.userId);
        if (!e || e.status === "left") return null;
        // A bot plays on for them; they can't come back.
        if (e.status === "in") e.status = "left";
        e.playedByBot = true;
        const table = currentTable(t.bracket, e.id);
        const code = table ? t.rooms[table.id] : undefined;
        if (code)
          await this.env.Room.getByName(code)
            .fetch("https://room/seat_left", {
              method: "POST",
              headers: { "x-gh-internal": "seat_left" },
              body: JSON.stringify({ entrant: e.id }),
            })
            .catch(() => null);
        await this.commit();
        return null;
      }
      case "t_config": {
        if (t.phase !== "lobby") return "WRONG_PHASE";
        if (!isHost) return "NOT_HOST";
        if (msg.config.entrants < t.joined.length) return "TOO_MANY_PLAYERS";
        const errors = checkConfig(msg.config);
        if (errors.length) return { t: "error", code: "BAD_STAGES", detail: errors };
        t.config = msg.config;
        await this.commit();
        if (t.config.autoStart && t.joined.length === t.config.entrants) return this.start();
        return null;
      }
      case "t_kick": {
        if (t.phase !== "lobby") return "WRONG_PHASE";
        if (!isHost) return "NOT_HOST";
        const i = Number(msg.entrant.replace(/^e/, ""));
        const target = t.joined[i];
        if (!target || target.userId === t.hostUserId) return "BAD_MESSAGE";
        t.joined.splice(i, 1);
        await this.commit();
        return null;
      }
      case "t_start":
        if (t.phase !== "lobby") return "WRONG_PHASE";
        if (!isHost) return "NOT_HOST";
        return this.start();
      case "t_cancel": {
        if (t.phase !== "lobby") return "WRONG_PHASE";
        if (!isHost) return "NOT_HOST";
        t.phase = "cancelled";
        t.v++;
        this.broadcastSnapshots();
        await this.destroy();
        return null;
      }
      default:
        return "BAD_MESSAGE";
    }
  }

  // ── Running it ────────────────────────────────────────────────────────────

  private async start(): Promise<TournamentErrorCode | ServerTournamentMsg | null> {
    const t = this.t as TourRec;
    const c = t.config;
    const people: Entrant[] = t.joined.map((p, i) => ({
      id: `e${i}`,
      userId: p.userId,
      name: p.name,
      avatar: p.avatar,
      bot: null,
      status: "in",
      byes: 0,
      lastFinish: null,
      playedByBot: false,
    }));
    const bots: Entrant[] = [];
    if (c.botFill)
      for (let i = people.length; i < c.entrants; i++)
        bots.push({
          id: `e${i}`,
          userId: null,
          name: `Bot ${i - people.length + 1} (${levelName(c.botFill)})`,
          avatar: null,
          bot: c.botFill,
          status: "in",
          byes: 0,
          lastFinish: null,
          playedByBot: false,
        });
    const entrants = [...people, ...bots];
    const errors = checkConfig(c, entrants.length);
    if (errors.length) return { t: "error", code: "BAD_STAGES", detail: errors };
    t.rngSeed = randomHex(16);
    const rng = seededRng(t.rngSeed);
    const r = startBracket(entrants, c.stages, rng);
    if (!r.ok) return { t: "error", code: "BAD_STAGES", detail: r.errors };
    t.rngCounter = rng.counter();
    t.bracket = r.step.bracket;
    t.phase = "running";
    t.startedAt = Date.now();
    t.deadlines = {};
    await this.createTables(r.step.created);
    await this.commit();
    this.broadcastEvents(r.step.events);
    this.sendGo(r.step.created);
    return null;
  }

  /** The new tables' rooms. Any that fail are retried from the alarm. */
  private async createTables(tables: BracketTable[]) {
    const t = this.t as TourRec;
    const made: string[] = [];
    for (const table of tables) {
      if (t.rooms[table.id]) continue;
      const code = await this.initRoom(table);
      if (code) {
        t.rooms[table.id] = code;
        made.push(table.id);
        t.pending = t.pending.filter((x) => x !== table.id);
      } else if (!t.pending.includes(table.id)) t.pending.push(table.id);
    }
    if (t.bracket && made.length) t.bracket = markRunning(t.bracket, made);
    t.deadlines.init = t.pending.length ? Date.now() + 5000 : undefined;
  }

  private async initRoom(table: BracketTable): Promise<string | null> {
    const t = this.t as TourRec;
    const b = t.bracket as Bracket;
    const stage = b.stages[table.stage];
    if (!stage) return null;
    const knockout = stage.tableSize === 2;
    const inRound = b.tables.filter(
      (x) => x.stage === table.stage && x.round === table.round,
    ).length;
    const where = knockout
      ? `${roundName(inRound * 2)}${inRound > 1 ? ` ${table.index + 1}` : ""}`
      : `Table ${table.index + 1}`;
    const init: Omit<TableInit, "code"> = {
      game: stage.game,
      rules: stage.rules,
      seats: table.seats.map((id) => {
        const e = b.entrants.find((x) => x.id === id) as Entrant;
        return {
          entrant: id,
          userId: e.userId,
          name: e.name,
          avatar: e.avatar,
          bot: e.bot ?? (e.status === "left" ? "medium" : null),
        };
      }),
      tournament: {
        code: t.code,
        name: t.config.name,
        stage: table.stage,
        round: table.round,
        table: table.id,
        label: `Stage ${table.stage + 1} · ${STAGE_GAMES[stage.game].name} · ${where}`,
        bestOf: knockout ? stage.bestOf : 1,
      },
      spectators: t.config.spectators,
      entrantUserIds: b.entrants.flatMap((e) => (e.userId ? [e.userId] : [])),
      ...(stage.game === "football"
        ? {
            squads: Object.fromEntries(
              table.seats.flatMap((id) => (t.squads[id] ? [[id, t.squads[id]]] : [])),
            ),
          }
        : {}),
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode(ROOM_CODE_LENGTH);
      try {
        const res = await this.env.Room.getByName(code, { locationHint: "weur" }).fetch(
          "https://room/table",
          {
            method: "POST",
            headers: { "x-gh-internal": "table" },
            body: JSON.stringify({ ...init, code } satisfies TableInit),
          },
        );
        if (res.status === 201) return code;
        if (res.status !== 409) return null;
      } catch {
        return null;
      }
    }
    return null;
  }

  /** A table's result (from its room; a repeat is acknowledged and ignored). */
  private async onReport(report: TableReport): Promise<Response> {
    const t = this.t;
    if (!t?.bracket || t.phase !== "running") return new Response(null, { status: 200 });
    const rng = seededRng(t.rngSeed, t.rngCounter);
    const step = reportTable(t.bracket, report.table, report.ranking, rng);
    if (!step) return new Response(null, { status: 200 });
    t.rngCounter = rng.counter();
    t.bracket = step.bracket;
    for (const m of report.matches) if (!t.matches.some((x) => x.id === m.id)) t.matches.push(m);
    for (const [id, squad] of Object.entries(report.squads ?? {})) t.squads[id] = squad;
    for (const id of report.playedByBot) {
      const e = t.bracket.entrants.find((x) => x.id === id);
      if (e) e.playedByBot = true;
    }
    if (t.bracket.placements) {
      t.phase = "finished";
      t.endedAt = Date.now();
      t.deadlines.post = Date.now();
    }
    await this.createTables(step.created);
    await this.commit();
    this.broadcastEvents(step.events);
    this.sendGo(step.created);
    return new Response(null, { status: 200 });
  }

  // ── Alarm ─────────────────────────────────────────────────────────────────

  override async onAlarm() {
    this.lastAlarm = null;
    const t = this.t;
    if (!t) return;
    const now = Date.now();
    const d = t.deadlines;
    if (d.idle !== undefined && d.idle <= now && t.phase === "lobby") {
      t.phase = "cancelled";
      this.broadcastSnapshots();
      return this.destroy();
    }
    if (d.purge !== undefined && d.purge <= now) return this.destroy();
    let changed = false;
    if (d.init !== undefined && d.init <= now && t.bracket) {
      const waiting = t.bracket.tables.filter((x) => t.pending.includes(x.id));
      await this.createTables(waiting);
      this.sendGo(waiting.filter((x) => t.rooms[x.id]));
      changed = true;
    }
    if (d.post !== undefined && d.post <= now) {
      await this.postResults();
      changed = true;
    }
    if (changed) await this.commit();
    else await this.persist();
  }

  /** The final standings and every table's games, to web (once; retried, then given up). */
  private async postResults() {
    const t = this.t as TourRec;
    const d = t.deadlines;
    d.post = undefined;
    const b = t.bracket;
    if (t.posted || !b?.placements) return;
    const secret = this.env.INTERNAL_HMAC_SECRET;
    const result: TournamentResult = {
      id: t.id,
      code: t.code,
      name: t.config.name,
      hostUserId: t.hostUserId || null,
      botFill: t.config.botFill,
      dataVersion: null,
      startedAt: t.startedAt ?? t.createdAt,
      endedAt: t.endedAt ?? Date.now(),
      stages: t.config.stages.map((s) => ({
        game: s.game,
        rules: s.rules,
        tableSize: s.tableSize,
        advance: s.advance,
      })),
      entries: b.placements.map((p) => {
        const e = b.entrants.find((x) => x.id === p.entrant) as Entrant;
        return {
          entrant: Number(e.id.slice(1)),
          userId: e.userId,
          isBot: !!e.bot,
          displayName: e.name.slice(0, 40),
          place: p.place,
          outAtStage: p.outAtStage,
          playedByBot: e.playedByBot,
        };
      }),
      matches: t.matches.slice(0, 64),
    };
    const body = JSON.stringify(result);
    try {
      const { ts, sig } = await signBody(secret, body);
      const res = await fetch(`${this.env.WEB_ORIGIN}/api/internal/tournament-result`, {
        method: "POST",
        body,
        headers: { "content-type": "application/json", "x-gh-ts": ts, "x-gh-sig": sig },
      });
      if (!res.ok) throw new Error(String(res.status));
      t.posted = true;
      d.purge = Date.now() + FINISHED_KEEP_MS;
    } catch {
      t.posts++;
      if (t.posts < MAX_POSTS) d.post = Date.now() + Math.min(MAX_POST_GAP_MS, 2000 * 2 ** t.posts);
      else d.purge = Date.now() + FINISHED_KEEP_MS;
    }
  }

  // ── Output ────────────────────────────────────────────────────────────────

  private send(conn: Connection, msg: ServerTournamentMsg) {
    conn.send(JSON.stringify(msg));
  }

  /** "Your table is ready" for someone with a table to go to. */
  private goFor(userId: string): ServerTournamentMsg | null {
    const t = this.t;
    const b = t?.bracket;
    if (!t || !b || t.phase !== "running") return null;
    const e = b.entrants.find((x) => x.userId === userId);
    if (!e || e.status === "left") return null;
    const table = currentTable(b, e.id);
    const code = table ? t.rooms[table.id] : undefined;
    return table && code ? { t: "t_go", table: table.id, code } : null;
  }

  private sendGo(tables: BracketTable[]) {
    const t = this.t;
    if (!t?.bracket) return;
    const users = new Set(
      tables
        .flatMap((x) => x.seats)
        .map((id) => t.bracket?.entrants.find((e) => e.id === id)?.userId)
        .filter((u): u is string => !!u),
    );
    for (const c of this.getConnections<ConnState>()) {
      if (!c.state || !users.has(c.state.userId)) continue;
      const go = this.goFor(c.state.userId);
      if (go) this.send(c, go);
    }
  }

  private broadcastEvents(events: BracketEvent[]) {
    for (const e of events) this.broadcast(JSON.stringify({ t: "t_event", ...e }));
  }

  private publicState(): TournamentPublic {
    const t = this.t as TourRec;
    const online = new Set([...this.getConnections<ConnState>()].map((c) => c.state?.userId));
    const b = t.bracket;
    const entrants: EntrantPublic[] = b
      ? b.entrants.map((e) => ({
          id: e.id,
          userId: e.userId,
          name: e.name,
          avatar: e.avatar,
          bot: e.bot,
          status: e.status,
          byes: e.byes,
          host: !!e.userId && e.userId === t.hostUserId,
          online: !!e.userId && online.has(e.userId),
        }))
      : t.joined.map((p, i) => ({
          id: `e${i}`,
          userId: p.userId,
          name: p.name,
          avatar: p.avatar,
          bot: null,
          status: "in",
          byes: 0,
          host: p.userId === t.hostUserId,
          online: online.has(p.userId),
        }));
    return {
      code: t.code,
      phase: t.phase,
      config: t.config,
      entrants,
      stage: b?.stage ?? 0,
      round: b?.round ?? 0,
      tables: (b?.tables ?? []).map((x) => ({ ...x, code: t.rooms[x.id] ?? null })),
      placements: b?.placements ?? null,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
    };
  }

  private snapshotFor(userId: string | undefined, state = this.publicState()): ServerTournamentMsg {
    const t = this.t as TourRec;
    const you = state.entrants.find((e) => e.userId === userId)?.id ?? "spectator";
    return { t: "t_snapshot", v: t.v, state, you, serverNow: Date.now() };
  }

  private sendSnapshot(conn: Connection<ConnState>) {
    if (this.t) this.send(conn, this.snapshotFor(conn.state?.userId));
  }

  /** Everyone sees the same public state; only "you" differs. */
  private broadcastSnapshots() {
    if (!this.t) return;
    const state = this.publicState();
    for (const c of this.getConnections<ConnState>())
      this.send(c, this.snapshotFor(c.state?.userId, state));
  }
}
