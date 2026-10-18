import {
  seededRng,
  type GameSlug,
  type RuleConfigBase,
  type RuleErrorCode,
  type SeatIndex,
} from "@gamehub/engine";
import { effective, type DraughtsRules, type DraughtsState } from "@gamehub/engine/draughts";
import {
  clientRoomMsg,
  CloseCode,
  createRoomRequest,
  MAX_FRAME_BYTES,
  roomCodeSchema,
  type BotLevel,
  type ClientRoomMsg,
  type FirstPlayer,
  type RoomErrorCode,
  type RoomMeta,
  type RoomPhase,
  type SeatPublic,
  type SeatStatus,
  type ServerRoomMsg,
  type TableInit,
  type MatchResult,
  type ReportRequest,
  type TableReport,
  type TicketClaims,
  type TournamentMatch,
} from "@gamehub/protocol";
import type { BotMoveRequest, BotMoveResponse, DraughtsBotRequest } from "@gamehub/protocol/bots";
import { signBody } from "@gamehub/protocol/hmac";
import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { ChatDesk } from "../chat";
import { gameFor, type AnyGame } from "./games";

/** Set by the Worker after verifying the ticket; never trusted from clients. */
export const CLAIMS_HEADER = "x-gh-claims";

const LOBBY_IDLE_MS = 10 * 60_000;
const ENDED_IDLE_MS = 5 * 60_000;
const MAX_TIMEOUTS = 3;
const MAX_ALARM_STEPS = 50;
/** Safety cap on actions chained into one turn (see GameDefinition.chainTurns). */
const MAX_CHAIN = 40;
const RECENT_IDS = 64;
const MAX_SPECTATORS = 20;
const TAKEOVER_BOT: BotLevel = "medium";
/** The DO waits this long for a bot-service move before using the built-in engine. */
const BOT_SERVICE_TIMEOUT_MS = 1500;
/** A tournament table starts once everyone is here, or after this long (absent people start away). */
const TABLE_START_MS = 60_000;
/** The pause between games of a best-of series. */
const NEXT_GAME_MS = 6_000;
/** A finished tournament table stays up a while so people can see the result and go back. */
const TABLE_ENDED_IDLE_MS = 10 * 60_000;

type SeatRec = {
  /** Stable id for whoever sits here (person or bot), so "who went first" survives seat moves. */
  key?: string;
  userId: string | null;
  name: string;
  avatar: string | null;
  status: SeatStatus;
  botLevel: BotLevel | null;
  ready: boolean;
  timeouts: number;
  /** Naija Plots: the token picked in the lobby (people only). */
  token?: number;
};

type Deadlines = {
  /**
   * Per-seat turn deadlines. Several seats can be due at once (parallel RPS
   * matches), and one player's move must not reset anyone else's clock.
   */
  turns?: Partial<Record<number, number>>;
  bot?: number | undefined;
  auto?: number | undefined;
  idle?: number | undefined;
  grace: Partial<Record<number, number>>;
  /** Tournament tables: start by themselves, the next game of a series, retry the report. */
  start?: number | undefined;
  next?: number | undefined;
  report?: number | undefined;
  /** Results for web and "they're free" for the matchmaker, retried until sent. */
  post?: number | undefined;
};

/** A quick-match room's record: its pool, and whether this game counts. */
type QuickRec = {
  queue: string;
  ranked: boolean;
  variant: string;
  timeControl: string | null;
};

/** Things to tell others, sent from the alarm and retried until they're taken. */
type OutboxItem =
  | { kind: "result"; result: MatchResult }
  | { kind: "free"; userIds: string[] }
  /** Presence: these people are in this game now (or not any more). */
  | { kind: "presence"; userIds: string[]; playing: boolean }
  /** A player's report, for the moderators. */
  | { kind: "report"; report: ReportRequest };

/** A tournament table's own record: its place in the tournament and its series so far. */
type TableRec = {
  code: string;
  name: string;
  stage: number;
  round: number;
  table: string;
  label: string;
  bestOf: 1 | 3 | 5;
  /** Games won per seat, games played (draws too). */
  wins: number[];
  games: number;
  matches: TournamentMatch[];
  /** Entrants a bot played for here. */
  botPlayed: string[];
  squads?: Record<string, unknown>;
  spectators: boolean;
  entrantUserIds: string[];
  /** The result to send, until the tournament has it. */
  report: TableReport | null;
  reported: boolean;
  tries: number;
  /** Entrants who left the tournament: their seat stays with a bot, even if they come back. */
  quit: string[];
};

/** Everything about the room, stored as ONE row so each change costs one write. */
type PersistedRoom = {
  roomId: string;
  code: string;
  kind: "private" | "quick" | "tournament";
  game: GameSlug;
  hostUserId: string;
  phase: RoomPhase;
  rules: RuleConfigBase;
  botLevel: BotLevel | null;
  seats: SeatRec[];
  state: unknown;
  v: number;
  rngSeed: string;
  rngCounter: number;
  deadlines: Deadlines;
  recentActionIds: Record<number, string[]>;
  /** Missing in rooms created before the setting existed: treated as "random". */
  firstPlayer?: FirstPlayer;
  /** The host turned text chat off (emotes stay). */
  chatOff?: boolean;
  /** Seat keys of the last game's first player and winner ("Takes turns", "Last winner"). */
  lastFirstKey?: string | undefined;
  lastWinnerKey?: string | undefined;
  startedAt?: number | undefined;
  endedAt?: number | undefined;
  tour?: TableRec;
  quick?: QuickRec;
  outbox?: OutboxItem[];
  outboxTries?: number;
};

type ConnState = {
  userId: string;
  name: string;
  avatar: string | null;
  seat: SeatIndex | "spectator";
  /** From the ticket: who they've blocked, their account's chat mute, public chat on or off. */
  blocked?: readonly string[];
  chatMutedUntil?: number | null;
  publicChat?: boolean;
};

const emptySeat = (): SeatRec => ({
  userId: null,
  name: "",
  avatar: null,
  status: "empty",
  botLevel: null,
  ready: false,
  timeouts: 0,
});

const levelName = (level: BotLevel) => `${level.charAt(0).toUpperCase()}${level.slice(1)}`;

const botSeat = (level: BotLevel): SeatRec => ({
  key: randomHex(6),
  userId: null,
  name: `Bot (${levelName(level)})`,
  avatar: null,
  status: "bot",
  botLevel: level,
  ready: true,
  timeouts: 0,
});

/** With more than one bot at the table, number them in seat order so players can tell them apart. */
function nameBots(seats: SeatRec[]) {
  const bots = seats.filter((s) => !s.userId && s.status === "bot" && s.botLevel);
  bots.forEach((s, k) => {
    const level = levelName(s.botLevel as BotLevel);
    s.name = bots.length > 1 ? `Bot ${k + 1} (${level})` : `Bot (${level})`;
  });
}

/** Seats a bot plays: actual bots, and humans who are gone (grace expired or left). */
const botControlled = (s: SeatRec) => s.status === "bot" || s.status === "left";

/** Fisher–Yates with crypto randomness (lobby seat shuffle; not part of any game's RNG). */
function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (crypto.getRandomValues(new Uint32Array(1))[0] as number) % (i + 1);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function randomHex(bytes: number) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class GameRoom extends Server<Env> {
  static override options = { hibernate: true };

  private room: PersistedRoom | null = null;

  /** The loaded room. Only call where a room is known to exist. */
  private get r(): PersistedRoom {
    if (!this.room) throw new Error("invariant: room not loaded");
    return this.room;
  }

  /** 60 s in production; tests shorten it through the GRACE_MS var. */
  private get graceMs(): number {
    const v = Number(this.env.GRACE_MS);
    return Number.isFinite(v) && v > 0 ? v : 60_000;
  }

  private seatAt(i: number): SeatRec {
    const s = this.r.seats[i];
    if (!s) throw new Error(`invariant: no seat ${i}`);
    return s;
  }
  private lastAlarm: number | null = null;
  private chat = new ChatDesk(
    () => this.env.CHAT_SIGN_SECRET,
    () => this.room?.code ?? "",
  );
  /** A spectator socket that's closing (not counted while we tell the others). */
  private closing: string | null = null;
  /** Bot service health, in memory (losing it on hibernation just means trying again). */
  private serviceFailures = 0;
  private serviceRestUntil = 0;
  /** Per-connection token buckets. In memory only: losing them on hibernation is fine. */
  private buckets = new Map<string, { tokens: number; at: number }>();

  // ── Storage ───────────────────────────────────────────────────────────────

  override onStart() {
    const sql = this.ctx.storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)",
    );
    const row = sql.exec<{ json: string }>("SELECT json FROM room WHERE id = 1").toArray()[0];
    this.room = row ? (JSON.parse(row.json) as PersistedRoom) : null;
  }

  /** One row write, plus an alarm write only when the alarm must ring earlier. */
  private async persist() {
    const room = this.room;
    if (!room) return;
    this.ctx.storage.sql.exec(
      "INSERT INTO room (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
      JSON.stringify(room),
    );
    await this.rearm();
  }

  /**
   * Points the room's one alarm at the earliest deadline. Each setAlarm is a row write, so
   * a later deadline leaves an earlier alarm in place: it rings, finds nothing due and
   * re-arms (one write per turn clock, instead of one per action).
   */
  private async rearm() {
    const room = this.room;
    if (!room) return;
    const d = room.deadlines;
    const times = [
      d.bot,
      d.auto,
      d.idle,
      d.start,
      d.next,
      d.report,
      d.post,
      ...Object.values(d.grace),
      ...Object.values(d.turns ?? {}),
    ].filter((t): t is number => typeof t === "number");
    const next = times.length ? Math.min(...times) : null;
    if (next === null) {
      if (this.lastAlarm !== null) await this.ctx.storage.deleteAlarm();
      this.lastAlarm = null;
    } else if (this.lastAlarm === null || next < this.lastAlarm) {
      await this.ctx.storage.setAlarm(next);
      this.lastAlarm = next;
    }
  }

  private async destroy() {
    for (const c of this.getConnections()) c.close(CloseCode.RoomGone, "room closed");
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.room = null;
    this.lastAlarm = null;
  }

  // ── Creation (internal HTTP from the Worker) ──────────────────────────────

  override async onRequest(req: Request): Promise<Response> {
    const internal = req.method === "POST" ? req.headers.get("x-gh-internal") : null;
    // From this room's tournament (never reachable from outside: the Worker routes no HTTP here).
    if (internal === "table") return this.initTable((await req.json()) as TableInit);
    if (internal === "seat_left") return this.seatLeft((await req.json()) as { entrant: string });
    if (internal === "kick") return this.kickUser((await req.json()) as { userId: string });
    if (internal !== "init") return new Response("Not found", { status: 404 });
    if (this.room) return new Response("in use", { status: 409 });

    const parsed = createRoomRequest.extend({ code: roomCodeSchema }).safeParse(await req.json());
    if (!parsed.success) return new Response("bad request", { status: 400 });
    const { game, rules: rawRules, botLevel, host, code } = parsed.data;
    const def = gameFor(game);
    if (!def) return new Response("unknown game", { status: 400 });
    const rules = def.ruleSchema.safeParse(rawRules ?? def.presets.naija);
    if (!rules.success) return new Response("bad rules", { status: 400 });

    const size = Math.min(
      def.maxPlayers,
      Math.max(def.minPlayers, parsed.data.players ?? def.maxPlayers),
    );
    const seats = Array.from({ length: size }, emptySeat);
    seats[0] = {
      ...emptySeat(),
      key: randomHex(6),
      userId: host.userId,
      name: host.name,
      avatar: host.avatar,
      status: "away",
    };
    // "Play a bot" at setup: seat the bots now so the lobby shows who you're playing.
    if (botLevel && parsed.data.seatBotsNow)
      for (let i = 1; i < seats.length; i++) seats[i] = botSeat(botLevel);
    nameBots(seats);
    this.room = {
      roomId: code,
      code,
      kind: "private",
      game,
      hostUserId: host.userId,
      phase: "lobby",
      rules: rules.data,
      botLevel,
      seats,
      state: null,
      v: 0,
      rngSeed: "",
      rngCounter: 0,
      deadlines: { grace: {}, idle: Date.now() + LOBBY_IDLE_MS },
      recentActionIds: {},
      firstPlayer: parsed.data.firstPlayer,
    };
    await this.persist();
    return new Response(null, { status: 201 });
  }

  /** Seats set by a tournament or the matchmaker: no lobby edits, starts by itself. */
  private get fixed(): boolean {
    return !!this.room?.tour || !!this.room?.quick;
  }

  /** Ranked chess and draughts: nobody's seat goes to a bot; the opponent may claim instead. */
  private get claimsOnly(): boolean {
    const r = this.room;
    return !!r?.quick?.ranked && (r.game === "chess" || r.game === "draughts");
  }

  /**
   * A tournament table (docs/16-tournaments.md), or a quick-match room (docs/08): seats fixed, no lobby edits.
   * It starts when everyone is here or after `TABLE_START_MS` (anyone missing starts away, so
   * the grace and then a bot follow), plays its best-of series, and reports to the tournament.
   */
  private async initTable(o: TableInit): Promise<Response> {
    if (this.room) return new Response("in use", { status: 409 });
    const def = gameFor(o.game);
    if (!def) return new Response("unknown game", { status: 400 });
    const rules = def.ruleSchema.safeParse(o.rules ?? def.presets.naija);
    const seats: SeatRec[] = o.seats.map((x) => ({
      key: x.entrant,
      userId: x.userId,
      name: x.name,
      avatar: x.avatar,
      // A person who left the tournament: a bot plays their seat from the start.
      status: x.bot ? (x.userId ? "left" : "bot") : "away",
      botLevel: x.bot,
      ready: true,
      timeouts: 0,
    }));
    const now = Date.now();
    const t = o.tournament;
    this.room = {
      roomId: o.code,
      code: o.code,
      kind: t ? "tournament" : "quick",
      game: o.game,
      hostUserId: "",
      phase: "lobby",
      rules: rules.success ? rules.data : def.presets.naija,
      botLevel: null,
      seats,
      state: null,
      v: 0,
      rngSeed: "",
      rngCounter: 0,
      // Nobody to wait for (all bots, or everyone left): start straight away.
      deadlines: {
        grace: {},
        start: seats.some((x) => x.status === "away") ? now + TABLE_START_MS : now,
      },
      recentActionIds: {},
      // Game 1 random, then the first move passes along (a series alternates colours).
      firstPlayer: t ? "rotate" : "random",
      ...(t
        ? {
            tour: {
              ...t,
              wins: seats.map(() => 0),
              games: 0,
              matches: [],
              botPlayed: seats.filter((x) => x.botLevel && x.userId).map((x) => x.key as string),
              ...(o.squads ? { squads: o.squads } : {}),
              spectators: o.spectators,
              entrantUserIds: o.entrantUserIds,
              report: null,
              reported: false,
              tries: 0,
              quit: [],
            },
          }
        : {}),
      ...(o.quick ? { quick: { ...o.quick } } : {}),
    };
    await this.persist();
    return new Response(null, { status: 201 });
  }

  /** The tournament says this entrant left it: a bot plays their seat from now on. */
  private async seatLeft(o: { entrant: string }): Promise<Response> {
    const room = this.room;
    const i = room ? room.seats.findIndex((x) => x.key === o.entrant) : -1;
    const s = room?.seats[i];
    if (room?.tour && s && s.userId && !room.tour.quit.includes(o.entrant)) {
      room.tour.quit.push(o.entrant);
      s.status = "left";
      s.botLevel = TAKEOVER_BOT;
      room.deadlines.grace[i] = undefined;
      this.botTookOver(s);
      if (room.phase === "playing") this.schedule();
      else if (room.phase === "lobby" && !room.seats.some((x) => x.status === "away"))
        room.deadlines.start = Date.now();
      await this.commit();
    }
    return new Response(null, { status: 200 });
  }

  /** A ban: their sockets close here; in a game a bot takes their seat, in a lobby it opens up. */
  private async kickUser(o: { userId: string }): Promise<Response> {
    const room = this.room;
    for (const c of this.getConnections<ConnState>())
      if (c.state?.userId === o.userId) c.close(CloseCode.Banned, "banned");
    const i = room ? room.seats.findIndex((x) => x.userId === o.userId) : -1;
    const s = room?.seats[i];
    if (room && s) {
      if (room.phase === "playing" || this.fixed) {
        s.status = "left";
        s.botLevel = TAKEOVER_BOT;
        room.deadlines.grace[i] = undefined;
        this.botTookOver(s);
        if (room.phase === "playing") this.schedule();
      } else room.seats[i] = emptySeat();
      await this.commit();
    }
    return new Response(null, { status: 200 });
  }

  /** A person's seat is now played by a bot (it shows on their tournament record). */
  private botTookOver(s: SeatRec) {
    const t = this.room?.tour;
    if (t && s.key && s.userId && !t.botPlayed.includes(s.key)) t.botPlayed.push(s.key);
  }

  // ── Connections ───────────────────────────────────────────────────────────

  override async onConnect(conn: Connection<ConnState>, ctx: ConnectionContext) {
    const raw = ctx.request.headers.get(CLAIMS_HEADER);
    const claims = raw ? (JSON.parse(raw) as TicketClaims) : null;
    if (!claims) return conn.close(CloseCode.Unauthorized, "unauthorized");
    const room = this.room;
    if (!room) return conn.close(CloseCode.RoomGone, "not found");

    // One socket per user: the newest wins.
    for (const c of this.getConnections<ConnState>()) {
      if (c.id !== conn.id && c.state?.userId === claims.sub)
        c.close(CloseCode.Replaced, "replaced");
    }

    let seat: SeatIndex | "spectator" = room.seats.findIndex((s) => s.userId === claims.sub);
    const tour = room.tour;
    // Left the tournament: they may watch, but a bot keeps their seat.
    if (tour && seat >= 0 && tour.quit.includes(room.seats[seat]?.key ?? "")) seat = -1;
    if (tour && seat === -1 && !tour.spectators && !tour.entrantUserIds.includes(claims.sub))
      return conn.close(CloseCode.Unauthorized, "not allowed");
    let changed = false;
    let watcherJoined = false;
    if (seat === -1) {
      const free = room.phase === "lobby" ? room.seats.findIndex((s) => s.status === "empty") : -1;
      if (free >= 0) {
        room.seats[free] = {
          ...emptySeat(),
          key: randomHex(6),
          userId: claims.sub,
          name: claims.name,
          avatar: claims.avatar,
          status: "connected",
        };
        seat = free;
        changed = true;
      } else {
        // Up to 20 watch a game (docs/03-realtime-protocol.md → Limits).
        const watching = [...this.getConnections<ConnState>()].filter(
          (c) => c.id !== conn.id && c.state?.seat === "spectator",
        ).length;
        if (watching >= MAX_SPECTATORS) return conn.close(CloseCode.Full, "full");
        seat = "spectator";
        watcherJoined = true;
      }
    } else {
      const s = this.seatAt(seat);
      if (s.status !== "connected") {
        s.status = "connected";
        s.botLevel = null;
        s.timeouts = 0;
        room.deadlines.grace[seat] = undefined;
        changed = true;
      }
      s.name = claims.name;
      s.avatar = claims.avatar;
    }

    conn.setState({
      userId: claims.sub,
      name: claims.name,
      avatar: claims.avatar,
      seat,
      blocked: claims.blocked ?? [],
      chatMutedUntil: claims.chatMutedUntil ?? null,
      publicChat: claims.publicChat ?? true,
    });
    if (changed) {
      // A fixed table starts as soon as everyone has arrived.
      if (this.fixed && room.phase === "lobby" && !room.seats.some((x) => x.status === "away"))
        room.deadlines.start = Date.now();
      if (room.phase === "lobby" && !this.fixed) room.deadlines.idle = Date.now() + LOBBY_IDLE_MS;
      // Ranked: back before anyone claimed, so play just goes on.
      if (this.claimsOnly && room.phase === "playing" && typeof seat === "number") {
        const st = room.state as { gone?: string | null } | null;
        if (st?.gone) this.applyAction(seat, { type: "gone", gone: false });
      }
      if (room.phase === "playing") this.schedule();
      room.v++;
      await this.persist();
      this.broadcastSnapshots();
    } else if (watcherJoined) this.broadcastSnapshots(); // the players' "N watching" (no write)
    // The client asks for its snapshot with "hello".
  }

  override async onClose(conn: Connection<ConnState>) {
    this.buckets.delete(conn.id);
    if (conn.state?.seat === "spectator" && this.room) {
      this.broadcastSnapshots(conn.id);
      return;
    }
    const st = conn.state;
    const room = this.room;
    if (!st || st.seat === "spectator" || !room) return;
    const stillHere = [...this.getConnections<ConnState>()].some(
      (c) => c.id !== conn.id && c.state?.userId === st.userId,
    );
    if (stillHere) return;
    const seat = room.seats[st.seat];
    if (!seat || seat.userId !== st.userId) return;

    if (room.phase === "lobby") {
      // Lobby: just show them as away; they keep the seat until kicked or idle cleanup.
      if (seat.status === "connected") {
        seat.status = "away";
        seat.ready = false;
        room.v++;
        await this.persist();
        this.broadcastSnapshots();
      }
      return;
    }
    if (room.phase === "playing" && seat.status === "connected") {
      seat.status = "away";
      room.deadlines.grace[st.seat] = Date.now() + this.graceMs;
      room.v++;
      await this.persist();
      this.broadcastSnapshots();
    }
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  private allow(conn: Connection) {
    const now = Date.now();
    const b = this.buckets.get(conn.id) ?? { tokens: 20, at: now };
    b.tokens = Math.min(20, b.tokens + ((now - b.at) / 1000) * 10);
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
    const parsed = clientRoomMsg.safeParse(json);
    if (!parsed.success) return this.send(conn, { t: "error", code: "BAD_MESSAGE" });
    const room = this.room;
    const st = conn.state;
    if (!room || !st) return conn.close(CloseCode.RoomGone, "not found");

    const msg = parsed.data;
    if (msg.t === "hello") {
      this.sendSnapshot(conn);
      return this.send(conn, {
        t: "chat_state",
        mutedUntil: this.chat.mutedUntil(st),
        off: this.chatOff(st),
      });
    }
    if (msg.t === "ping") return this.send(conn, { t: "pong", c: msg.c, s: Date.now() });
    if (msg.t === "chat" || msg.t === "emote" || msg.t === "report") return this.onChat(conn, msg);
    if (st.seat === "spectator") return;

    const err = await this.handle(msg, st.seat, st.userId, conn);
    if (err) this.send(conn, { t: "error", code: err });
  }

  /** Chat is off: the host turned it off, or you're watching a quick-match game. */
  private chatOff(st: Pick<ConnState, "seat">): boolean {
    const room = this.r;
    return !!room.chatOff || (!!room.quick && st.seat === "spectator");
  }

  /** Chat, emotes and reports (docs/09-chat-moderation.md). Nothing is stored. */
  private async onChat(
    conn: Connection<ConnState>,
    msg: Extract<ClientRoomMsg, { t: "chat" | "emote" | "report" }>,
  ) {
    const st = conn.state as ConnState;
    const room = this.r;
    const publicGame = !!room.quick;
    if (msg.t === "chat") {
      if (this.chatOff(st)) return this.send(conn, { t: "chat_error", code: "OFF" });
      const r = await this.chat.line(st, msg.text);
      if ("error" in r)
        return this.send(conn, {
          t: "chat_error",
          code: r.error,
          ...(r.until ? { until: r.until } : {}),
        });
      for (const c of this.getConnections<ConnState>())
        if (c.state && ChatDesk.delivers(c.state, st.userId, publicGame)) this.send(c, r.msg);
      return;
    }
    if (msg.t === "emote") {
      const e = this.chat.emote(st, msg.id);
      if (!e) return;
      for (const c of this.getConnections<ConnState>())
        if (c.state && !c.state.blocked?.includes(st.userId)) this.send(c, e);
      return;
    }
    // A report: about someone at this table (or watching), with the line if it's really theirs.
    const here =
      room.seats.some((x) => x.userId === msg.target) ||
      [...this.getConnections<ConnState>()].some((c) => c.state?.userId === msg.target);
    if (!here || msg.target === st.userId)
      return this.send(conn, { t: "chat_error", code: "BAD_REPORT" });
    const message = await this.chat.verify(msg.line, msg.target);
    this.send2({
      kind: "report",
      report: {
        reporterId: st.userId,
        targetId: msg.target,
        roomId: room.code,
        reason: msg.reason,
        message,
      },
    });
    await this.persist();
    this.send(conn, { t: "chat_error", code: "REPORTED" });
  }

  private async handle(
    msg: Exclude<ClientRoomMsg, { t: "hello" | "ping" | "chat" | "emote" | "report" }>,
    seat: SeatIndex,
    userId: string,
    conn: Connection<ConnState>,
  ): Promise<RoomErrorCode | null> {
    const room = this.r;
    const isHost = room.hostUserId === userId;
    // Tournament tables are set by the tournament: no lobby edits, no rematch.
    if (
      this.fixed &&
      (msg.t === "config" ||
        msg.t === "shuffle" ||
        msg.t === "seat_bot" ||
        msg.t === "kick" ||
        msg.t === "start" ||
        msg.t === "rematch")
    )
      return "WRONG_PHASE";

    switch (msg.t) {
      case "act":
        return this.act(conn, seat, msg.id, msg.a);

      case "ready": {
        if (room.phase !== "lobby") return "WRONG_PHASE";
        this.seatAt(seat).ready = msg.ready;
        return this.commit();
      }

      case "token": {
        if (room.phase !== "lobby") return "WRONG_PHASE";
        if (room.seats.some((x, i) => i !== seat && x.token === msg.token)) return "BAD_MESSAGE";
        this.seatAt(seat).token = msg.token;
        return this.commit();
      }

      case "config": {
        if (room.phase !== "lobby") return "WRONG_PHASE";
        if (!isHost) return "NOT_HOST";
        return this.configure(msg);
      }

      case "shuffle": {
        if (room.phase !== "lobby") return "WRONG_PHASE";
        if (!isHost) return "NOT_HOST";
        // People and bots in a random order; empty seats stay at the end.
        const taken = room.seats.filter((x) => x.status !== "empty");
        const order = shuffled(taken);
        room.seats = [...order, ...room.seats.filter((x) => x.status === "empty")];
        nameBots(room.seats);
        this.reseatConnections();
        return this.commit();
      }

      case "seat_bot": {
        if (room.phase !== "lobby") return "WRONG_PHASE";
        if (!isHost) return "NOT_HOST";
        const target = room.seats[msg.seat];
        if (!target || target.userId) return "BAD_MESSAGE";
        room.seats[msg.seat] = msg.level ? botSeat(msg.level) : emptySeat();
        nameBots(room.seats);
        return this.commit();
      }

      case "kick": {
        if (room.phase !== "lobby") return "WRONG_PHASE";
        if (!isHost) return "NOT_HOST";
        const target = room.seats[msg.seat];
        if (!target || !target.userId || target.userId === room.hostUserId) return "BAD_MESSAGE";
        for (const c of this.getConnections<ConnState>()) {
          if (c.state?.userId === target.userId) c.close(CloseCode.Kicked, "kicked");
        }
        room.seats[msg.seat] = emptySeat();
        return this.commit();
      }

      case "start":
        if (room.phase !== "lobby") return "WRONG_PHASE";
        if (!isHost) return "NOT_HOST";
        return this.start();

      case "leave":
        return this.leave(seat, conn);

      case "rematch": {
        if (room.phase !== "ended") return "WRONG_PHASE";
        this.toLobby();
        return this.commit();
      }

      default:
        return "BAD_MESSAGE";
    }
  }

  /**
   * The host's Edit sheet: game, seat count, rules, bot fill and who goes first, in one go.
   * People keep their seats in order; shrinking drops empty seats first, then bots.
   */
  private configure(msg: Extract<ClientRoomMsg, { t: "config" }>): Promise<null> | RoomErrorCode {
    const room = this.r;
    const def = gameFor(msg.game);
    if (!def) return "BAD_MESSAGE";
    const rules = def.ruleSchema.safeParse(msg.rules);
    if (!rules.success) return "BAD_MESSAGE";
    const size = msg.players;
    if (size < def.minPlayers || size > def.maxPlayers) return "BAD_MESSAGE";
    if (room.seats.filter((x) => x.userId).length > size) return "TOO_MANY_PLAYERS";

    const seats = [...room.seats];
    const lastOf = (pred: (x: SeatRec) => boolean) => seats.findLastIndex(pred);
    while (seats.length > size) {
      const i = lastOf((x) => x.status === "empty");
      seats.splice(i >= 0 ? i : lastOf((x) => !x.userId), 1);
    }
    while (seats.length < size) seats.push(emptySeat());
    if (msg.seatBotsNow && msg.botLevel)
      for (let i = 0; i < seats.length; i++)
        if (seats[i]?.status === "empty") seats[i] = botSeat(msg.botLevel);
    nameBots(seats);

    room.game = msg.game;
    room.rules = rules.data;
    room.botLevel = msg.botLevel;
    room.firstPlayer = msg.firstPlayer;
    if (msg.chat !== undefined) room.chatOff = !msg.chat;
    room.seats = seats;
    this.reseatConnections();
    return this.commit();
  }

  /** Back to the lobby after a game (rematch) or an aborted one. Seats of people who left open up. */
  private toLobby() {
    const room = this.r;
    for (const s of room.seats) {
      if (s.status === "left" || s.status === "away") Object.assign(s, emptySeat());
      if (s.userId) s.ready = false;
      s.timeouts = 0;
    }
    room.phase = "lobby";
    room.state = null;
    room.recentActionIds = {};
    room.deadlines = { grace: {}, idle: Date.now() + LOBBY_IDLE_MS, ...this.pendingPost() };
    if (!room.seats.some((s) => s.userId === room.hostUserId)) {
      const next = room.seats.find((s) => s.userId);
      if (next?.userId) room.hostUserId = next.userId;
    }
  }

  /** Seat indexes may have shifted; tell each connection its new seat. */
  private reseatConnections() {
    const room = this.r;
    for (const c of this.getConnections<ConnState>()) {
      const st = c.state;
      if (!st) continue;
      const idx = room.seats.findIndex((x) => x.userId === st.userId);
      c.setState({ ...st, seat: idx >= 0 ? idx : "spectator" });
    }
  }

  /** The seat that moves first this game, from the room's "Who goes first" setting. */
  private firstSeat(): SeatIndex {
    const room = this.r;
    const n = room.seats.length;
    const random = seededRng(`${room.rngSeed}:first`).int(n);
    const at = (key: string | undefined) => (key ? room.seats.findIndex((x) => x.key === key) : -1);
    switch (room.firstPlayer ?? "random") {
      case "seat1":
        return 0;
      case "rotate": {
        const i = at(room.lastFirstKey);
        return i >= 0 ? (i + 1) % n : random;
      }
      case "lastWinner": {
        const i = at(room.lastWinnerKey);
        return i >= 0 ? i : random;
      }
      default:
        return random;
    }
  }

  private async commit(): Promise<null> {
    const room = this.r;
    room.v++;
    if (room.phase === "lobby" && !this.fixed) room.deadlines.idle = Date.now() + LOBBY_IDLE_MS;
    await this.persist();
    this.broadcastSnapshots();
    return null;
  }

  private def(): AnyGame {
    const def = gameFor(this.r.game);
    if (!def) throw new Error(`no engine for ${this.r.game}`);
    return def;
  }

  // ── Game flow ─────────────────────────────────────────────────────────────

  private async start(): Promise<RoomErrorCode | null> {
    const room = this.r;
    const def = this.def();
    // Empty seats: bots if the host asked for them, otherwise the game must be full.
    for (let i = 0; i < room.seats.length; i++) {
      const s = this.seatAt(i);
      if (s.status === "empty" && room.botLevel) room.seats[i] = botSeat(room.botLevel);
    }
    const filled = room.seats.filter((s) => s.status !== "empty");
    if (filled.length < def.minPlayers) return "NOT_ENOUGH_PLAYERS";
    room.seats = filled;
    nameBots(room.seats);

    room.rngSeed = randomHex(16);
    room.rngCounter = 0;
    const rng = seededRng(room.rngSeed);
    const first = this.firstSeat();
    room.lastFirstKey = room.seats[first]?.key;
    const tour = room.tour;
    // A series still level after its games: the decider (chess at a quicker clock).
    if (tour && tour.games >= tour.bestOf) room.rules = deciderRules(room.game, room.rules);
    // Football: squads drafted at an earlier stage come with their managers.
    const carry = tour?.squads
      ? room.seats.map((x) => tour.squads?.[x.key ?? ""] ?? null)
      : undefined;
    room.state = def.setup(
      room.seats.length,
      { rng, rules: room.rules, now: Date.now() },
      first,
      carry,
    );
    room.rngCounter = rng.counter();
    room.phase = "playing";
    room.startedAt = Date.now();
    room.endedAt = undefined;
    room.recentActionIds = {};
    room.deadlines = { grace: {}, ...this.pendingPost() };
    room.seats.forEach((s, i) => {
      s.timeouts = 0;
      if (s.status === "away") room.deadlines.grace[i] = Date.now() + this.graceMs;
    });
    this.reseatConnections();
    this.schedule();
    // Friends see "In Whot" (and can watch).
    if (this.people().length)
      this.send2({ kind: "presence", userIds: this.people(), playing: true });
    room.v++;
    await this.persist();
    this.broadcastSnapshots();
    return null;
  }

  private async leave(seat: SeatIndex, conn: Connection<ConnState>): Promise<RoomErrorCode | null> {
    const room = this.r;
    const s = this.seatAt(seat);
    if (this.claimsOnly && room.phase === "playing") {
      // Ranked chess and draughts: leaving is resigning (no bot plays on).
      this.applyAction(seat, { type: "resign" });
      s.status = "left";
      conn.close(CloseCode.Normal, "left");
      return this.commit();
    }
    if (this.fixed && room.phase !== "ended") {
      // A fixed seat is never given up: a bot plays it (they can come back).
      s.status = "left";
      s.botLevel = TAKEOVER_BOT;
      room.deadlines.grace[seat] = undefined;
      this.botTookOver(s);
      if (room.phase === "playing") this.schedule();
      else if (!room.seats.some((x) => x.status === "away")) room.deadlines.start = Date.now();
      conn.close(CloseCode.Normal, "left");
      return this.commit();
    }
    if (room.phase === "lobby") {
      const wasHost = s.userId === room.hostUserId;
      room.seats[seat] = emptySeat();
      if (conn.state) conn.setState({ ...conn.state, seat: "spectator" });
      if (wasHost) {
        const next = room.seats.find((x) => x.userId);
        if (!next?.userId) {
          await this.destroy();
          return null;
        }
        room.hostUserId = next.userId;
      }
      conn.close(CloseCode.Normal, "left");
      return this.commit();
    }
    if (room.phase === "playing") {
      s.status = "left";
      s.botLevel = TAKEOVER_BOT;
      room.deadlines.grace[seat] = undefined;
      this.botTookOver(s);
      this.schedule();
      conn.close(CloseCode.Normal, "left");
      return this.commit();
    }
    conn.close(CloseCode.Normal, "left");
    return null;
  }

  /** Applies one action through the engine. Returns false if it was rejected. */
  /** The move a bot makes for `seat` now (consumes the game's RNG stream). */
  private botAction(seat: SeatIndex): unknown {
    const room = this.r;
    const rng = seededRng(room.rngSeed, room.rngCounter);
    const level = this.seatAt(seat).botLevel ?? TAKEOVER_BOT;
    const action = this.def().bots[level](room.state, seat, room.rules, rng);
    room.rngCounter = rng.counter();
    return action;
  }

  /**
   * A strong bot's move from the bot service (on Vercel): chess Medium/Hard (Stockfish) and
   * draughts Hard (our own search, with more time). Null means use the built-in engine: no
   * service configured, today's CPU budget spent, a timeout, an error, or three failures in a
   * row (then the service rests for 10 minutes). Players never see a failure.
   */
  private async serviceBotAction(seat: SeatIndex): Promise<unknown> {
    const room = this.r;
    const level = this.seatAt(seat).botLevel ?? TAKEOVER_BOT;
    const { BOT_SERVICE_URL: chessUrl, BOT_HMAC_SECRET: secret } = this.env;
    const wanted =
      (room.game === "chess" && level !== "easy") || (room.game === "draughts" && level === "hard");
    if (!wanted || !chessUrl || !secret) return null;
    if (Date.now() < this.serviceRestUntil) return null;
    const quota = this.env.Quota.getByName("global");
    if (!(await quota.allowBot())) return null;

    // BOT_SERVICE_URL names the chess route; draughts is its sibling.
    const url =
      room.game === "draughts" ? chessUrl.replace(/\/chess\/move$/, "/draughts/move") : chessUrl;
    const body = room.game === "draughts" ? this.draughtsRequest() : this.chessRequest(level);
    try {
      const { ts, sig } = await signBody(secret, body);
      const res = await fetch(url, {
        method: "POST",
        body,
        headers: { "content-type": "application/json", "x-gh-ts": ts, "x-gh-sig": sig },
        signal: AbortSignal.timeout(BOT_SERVICE_TIMEOUT_MS),
      });
      const out = (await res.json()) as BotMoveResponse;
      if (!res.ok || !out.ok) throw new Error(out.ok ? String(res.status) : out.code);
      await quota.addBot(out.cpuMs);
      if (room.game === "chess") return { type: "move", uci: out.move };
      const [from, ...path] = out.move.split(/[-x]/).map(Number);
      return { type: "move", from, path };
    } catch {
      this.serviceFailed();
      return null;
    }
  }

  private chessRequest(level: BotLevel): string {
    const room = this.r;
    const s = room.state as { fen: string; history: string[]; moves: string[] };
    // The position at the last pawn move or capture, plus the moves since: repetitions show.
    const since = Number(s.fen.split(" ")[4] ?? 0);
    return JSON.stringify({
      game: "chess",
      level: level === "hard" ? "hard" : "medium",
      position: s.history[s.history.length - 1 - since] ?? s.fen,
      history: since ? s.moves.slice(-since) : [],
      movetimeMs: level === "hard" ? 200 : 100,
      roomId: room.code,
    } satisfies BotMoveRequest);
  }

  private draughtsRequest(): string {
    const room = this.r;
    const s = room.state as DraughtsState;
    const rules = effective(room.rules as DraughtsRules);
    return JSON.stringify({
      game: "draughts",
      level: "hard",
      variant: s.variant,
      board: s.history[s.history.length - 1] as string,
      turn: s.turn,
      menCaptureBackward: rules.menCaptureBackward,
      flyingKings: rules.flyingKings,
      captureRule: rules.captureRule,
      movetimeMs: 150,
      roomId: room.code,
    } satisfies DraughtsBotRequest);
  }

  /** Three failures in a row (errors, timeouts, illegal moves) rest the service for 10 minutes. */
  private serviceFailed() {
    if (++this.serviceFailures >= 3) {
      this.serviceRestUntil = Date.now() + 10 * 60_000;
      this.serviceFailures = 0;
    }
  }

  /** Applies one action and sends its events. Returns them, or null if the engine refused. */
  private step(seat: SeatIndex, action: unknown, onReject?: (code: RuleErrorCode) => void) {
    const room = this.r;
    const rng = seededRng(room.rngSeed, room.rngCounter);
    const res = this.def().apply(
      room.state,
      { seat, action },
      { rng, rules: room.rules, now: Date.now() },
    );
    if (!res.ok) {
      onReject?.(res.error);
      return null;
    }
    room.state = res.state;
    room.rngCounter = rng.counter();
    room.v++;
    for (const e of res.events)
      this.broadcast(JSON.stringify({ t: "event", v: room.v, e } satisfies ServerRoomMsg));
    return res.events;
  }

  private applyAction(
    seat: SeatIndex,
    action: unknown,
    onReject?: (code: RuleErrorCode) => void,
  ): boolean {
    const room = this.r;
    const def = this.def();
    const events = this.step(seat, action, onReject);
    if (!events) return false;
    // Chained games (Ludo): a forced follow-up and the rest of a bot's turn happen now, in
    // this same write; clients play the burst back at human speed (docs/13 rule 4).
    if (def.chainTurns) {
      for (let i = 0; i < MAX_CHAIN && !def.isOver(room.state); i++) {
        const auto = def.autoAdvance(room.state, room.rules);
        const current = def.currentSeats(room.state);
        const next =
          auto && auto.afterMs === 0
            ? auto
            : current.length === 1 && current[0] === seat && botControlled(this.seatAt(seat))
              ? { seat, action: this.botAction(seat) }
              : null;
        if (!next) break;
        const more = this.step(next.seat, next.action);
        if (!more) break;
        events.push(...more);
      }
    }
    // Bots answer what was just asked of them, even off their turn (chess: takebacks, draws).
    if (def.botReply && !def.isOver(room.state)) {
      const current = def.currentSeats(room.state);
      room.seats.forEach((x, i) => {
        if (!botControlled(x) || current.includes(i) || def.isOver(room.state)) return;
        const reply = def.botReply?.(room.state, i, room.rules);
        const more = reply ? this.step(i, reply) : null;
        if (more) events.push(...more);
      });
    }
    if (def.isOver(room.state)) this.finish();
    else {
      // Clocks start once the client has played everything that just happened.
      const pauseMs = events.reduce((t, e) => {
        const p = def.eventPauses?.[e.type];
        return t + (typeof p === "function" ? p(e) : (p ?? 0));
      }, 0);
      this.schedule({ fresh: seat, pauseMs });
    }
    return true;
  }

  private async act(conn: Connection<ConnState>, seat: SeatIndex, id: string, rawAction: unknown) {
    const room = this.r;
    if (room.phase !== "playing") return "WRONG_PHASE" as const;
    const recent = (room.recentActionIds[seat] ??= []);
    if (recent.includes(id)) {
      this.send(conn, { t: "ack", id, v: room.v });
      return null;
    }
    const action = this.def().actionSchema.safeParse(rawAction);
    if (!action.success) {
      this.send(conn, { t: "reject", id, code: "BAD_ACTION", v: room.v });
      this.sendSnapshot(conn);
      return null;
    }
    let rejected = false;
    const applied = this.applyAction(seat, action.data, (code) => {
      rejected = true;
      this.send(conn, { t: "reject", id, code, v: room.v });
      this.sendSnapshot(conn);
    });
    if (!applied || rejected) return null;
    recent.push(id);
    if (recent.length > RECENT_IDS) recent.splice(0, recent.length - RECENT_IDS);
    this.seatAt(seat).timeouts = 0;
    await this.persist();
    this.send(conn, { t: "ack", id, v: room.v });
    this.broadcastSnapshots();
    return null;
  }

  private finish() {
    const room = this.r;
    const def = this.def();
    if (def.aborted?.(room.state)) {
      if (room.tour) {
        // A tournament game must have a result: play it again (an absent side gets a bot soon).
        room.phase = "lobby";
        room.state = null;
        room.deadlines = { grace: {}, next: Date.now() + 2000 };
        return;
      }
      if (room.quick) {
        // Quick match: nobody moved in time, so no game and no rating. Everyone is free again.
        room.phase = "ended";
        room.endedAt = Date.now();
        room.deadlines = { grace: {}, idle: Date.now() + ENDED_IDLE_MS };
        this.send2({ kind: "free", userIds: this.people() });
        this.send2({ kind: "presence", userIds: this.people(), playing: false });
        return;
      }
      // No result (chess: nobody moved in time): straight back to the lobby, as after a rematch.
      this.toLobby();
      return;
    }
    room.phase = "ended";
    room.endedAt = Date.now();
    room.deadlines = { grace: {}, idle: Date.now() + ENDED_IDLE_MS };
    const ranking = def.ranking(room.state);
    if (room.tour) this.finishTableGame(ranking);
    else {
      // Results go to web: every game counts in stats; quick-match ones with only people rate.
      this.send2({ kind: "result", result: this.matchResult(ranking) });
      if (room.quick) this.send2({ kind: "free", userIds: this.people() });
    }
    if (this.people().length)
      this.send2({ kind: "presence", userIds: this.people(), playing: false });
    const winner = ranking[0]?.[0];
    room.lastWinnerKey = winner === undefined ? undefined : room.seats[winner]?.key;
    this.broadcast(
      JSON.stringify({
        t: "ended",
        v: room.v,
        ranking,
        ranked: !!room.quick?.ranked,
      } satisfies ServerRoomMsg),
    );
  }

  /** Keeps a waiting outbox scheduled when deadlines are reset. */
  private pendingPost(): { post?: number } {
    return this.room?.outbox?.length ? { post: Date.now() } : {};
  }

  /** People at the table (bots have no account). */
  private people(): string[] {
    return this.r.seats.flatMap((x) => (x.userId ? [x.userId] : []));
  }

  /** Queues something for the alarm to send (and retry). */
  private send2(item: OutboxItem) {
    const room = this.r;
    (room.outbox ??= []).push(item);
    room.outboxTries = 0;
    room.deadlines.post = Date.now();
  }

  /**
   * The game as a match record. Quick match: a person who left is placed after everyone still
   * playing (their seat's bot result doesn't count for them); ranked games rate people only.
   */
  private matchResult(ranking: SeatIndex[][]): MatchResult {
    const room = this.r;
    const now = Date.now();
    let order = ranking;
    if (room.quick) {
      const left = (i: number) => room.seats[i]?.status === "left" && !!room.seats[i]?.userId;
      const stayed = ranking.map((g) => g.filter((i) => !left(i))).filter((g) => g.length);
      const gone = ranking.flat().filter(left);
      order = gone.length ? [...stayed, gone] : stayed;
    }
    const placeOf = (i: number) => {
      let place = 1;
      for (const g of order) {
        if (g.includes(i)) return place;
        place += g.length;
      }
      return place;
    };
    // Football's solo run: one person, a record of how far it went.
    const st = room.state as {
      soloRun?: { wins: number; played: number; teamRating: number };
      dataVersion?: string;
    } | null;
    const solo =
      room.game === "football" && room.seats.length === 1 && st?.soloRun
        ? {
            ...st.soloRun,
            luck: String((room.rules as { draftLuck?: string }).draftLuck ?? "balanced"),
            dataVersion: st.dataVersion ?? "",
          }
        : undefined;
    return {
      id: `${room.code}-${room.startedAt ?? now}`,
      roomId: room.code,
      game: room.game,
      rules: room.rules,
      playerCount: room.seats.length,
      startedAt: room.startedAt ?? now,
      endedAt: now,
      kind: room.quick ? "quick" : "private",
      ranked: !!room.quick?.ranked,
      ...(solo ? { solo } : {}),
      variant: solo ? "solo" : (room.quick?.variant ?? "standard"),
      timeControl: room.quick?.timeControl ?? null,
      players: room.seats.map((x, i) => ({
        seat: i,
        userId: x.userId,
        isBot: !x.userId,
        botLevel: x.userId ? null : x.botLevel,
        displayName: x.name.slice(0, 40) || "Player",
        place: Math.min(8, placeOf(i)),
        leftEarly: x.status === "left",
      })),
    };
  }

  /** Sends the outbox: results to web (signed), free players to the matchmaker. */
  private async sendOutbox() {
    const room = this.r;
    room.deadlines.post = undefined;
    const items = room.outbox ?? [];
    const rest: OutboxItem[] = [];
    for (const item of items) {
      try {
        if (item.kind === "result") {
          const secret = this.env.INTERNAL_HMAC_SECRET;
          const body = JSON.stringify(item.result);
          const { ts, sig } = await signBody(secret, body);
          const res = await fetch(`${this.env.WEB_ORIGIN}/api/internal/match-result`, {
            method: "POST",
            body,
            headers: { "content-type": "application/json", "x-gh-ts": ts, "x-gh-sig": sig },
            signal: AbortSignal.timeout(8000),
          });
          // A refusal (bad data) won't get better by retrying; network trouble might.
          if (!res.ok && res.status >= 500) throw new Error(String(res.status));
        } else if (item.kind === "report") {
          const body = JSON.stringify(item.report);
          const { ts, sig } = await signBody(this.env.INTERNAL_HMAC_SECRET, body);
          const res = await fetch(`${this.env.WEB_ORIGIN}/api/internal/report`, {
            method: "POST",
            body,
            headers: { "content-type": "application/json", "x-gh-ts": ts, "x-gh-sig": sig },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok && res.status >= 500) throw new Error(String(res.status));
        } else if (item.kind === "presence") {
          const res = await this.env.Presence.getByName("global").fetch("https://presence/status", {
            method: "POST",
            headers: { "x-gh-internal": "status" },
            body: JSON.stringify({
              userIds: item.userIds,
              inGame: item.playing ? { game: room.game, code: room.code, kind: room.kind } : null,
            }),
          });
          if (!res.ok) throw new Error(String(res.status));
        } else {
          const res = await this.env.Match.getByName("global").fetch("https://match/free", {
            method: "POST",
            headers: { "x-gh-internal": "free" },
            body: JSON.stringify({ userIds: item.userIds, code: room.code }),
          });
          if (!res.ok) throw new Error(String(res.status));
        }
      } catch {
        rest.push(item);
      }
    }
    room.outbox = rest;
    if (rest.length) {
      room.outboxTries = (room.outboxTries ?? 0) + 1;
      // Give up after about an hour of trying.
      if (room.outboxTries < 12)
        room.deadlines.post = Date.now() + Math.min(10 * 60_000, 2000 * 2 ** room.outboxTries);
      else room.outbox = [];
    }
  }

  /**
   * A tournament table's game is over: count it towards the series, then either the next game
   * (after a pause) or the table's result for the tournament. One-on-one tables play best of N,
   * first to more than half, draws not counting; still level after N + 1 games, the tournament
   * tosses a coin.
   */
  private finishTableGame(ranking: SeatIndex[][]) {
    const room = this.r;
    const t = room.tour as TableRec;
    const now = Date.now();
    const placeOf = (i: number) => {
      let place = 1;
      for (const g of ranking) {
        if (g.includes(i)) return place;
        place += g.length;
      }
      return place;
    };
    t.matches.push({
      id: `${room.code}-${room.startedAt ?? now}`,
      roomId: room.code,
      game: room.game,
      rules: room.rules,
      playerCount: room.seats.length,
      startedAt: room.startedAt ?? now,
      endedAt: now,
      players: room.seats.map((x, i) => ({
        seat: i,
        userId: x.userId,
        isBot: !x.userId,
        botLevel: x.userId ? null : x.botLevel,
        displayName: x.name.slice(0, 40) || "Player",
        place: placeOf(i),
        leftEarly: x.status === "left",
      })),
    });
    t.games++;
    let final: SeatIndex[][] | null = ranking;
    if (room.seats.length === 2) {
      const top = ranking[0];
      if (top?.length === 1) t.wins[top[0] as number] = (t.wins[top[0] as number] ?? 0) + 1;
      const need = Math.ceil(t.bestOf / 2);
      const [a = 0, b = 0] = t.wins;
      if (a < need && b < need && t.games < t.bestOf + 1) final = null;
      else final = a === b ? [[0, 1]] : a > b ? [[0], [1]] : [[1], [0]];
    }
    room.deadlines.idle = undefined; // kept until the tournament has the result
    if (!final) {
      room.deadlines.next = now + NEXT_GAME_MS;
      return;
    }
    const carried = this.def().carryOut?.(room.state);
    const squads = carried
      ? Object.fromEntries(
          carried.flatMap((q, i) => (q && room.seats[i]?.key ? [[room.seats[i]?.key, q]] : [])),
        )
      : undefined;
    t.report = {
      table: t.table,
      ranking: final.map((g) => g.map((i) => room.seats[i]?.key ?? "")),
      playedByBot: [...t.botPlayed],
      matches: t.matches,
      ...(squads ? { squads } : {}),
    };
    room.deadlines.report = now;
  }

  /** Tells the tournament how the table went; retried from the alarm until it answers. */
  private async sendReport() {
    const room = this.r;
    const t = room.tour;
    const now = Date.now();
    room.deadlines.report = undefined;
    if (!t?.report || t.reported) return;
    try {
      const res = await this.env.Tournament.getByName(t.code).fetch("https://tournament/report", {
        method: "POST",
        headers: { "x-gh-internal": "report" },
        body: JSON.stringify(t.report),
      });
      if (!res.ok) throw new Error(String(res.status));
      t.reported = true;
      t.report = null;
      room.deadlines.idle = now + TABLE_ENDED_IDLE_MS;
    } catch {
      t.tries++;
      room.deadlines.report = now + Math.min(60_000, 1000 * 2 ** t.tries);
    }
  }

  /** Recomputes the turn / bot / auto-advance deadlines from the current state. */
  /**
   * Recomputes turn / bot / auto-advance deadlines.
   * `fresh`: the seat that just moved. If it's due again (a new throw, a second move),
   * that's a new turn, so it gets a full clock instead of whatever was left.
   * `pauseMs`: delay before any new clock starts (see GameDefinition.eventPauses).
   */
  private schedule({ fresh, pauseMs = 0 }: { fresh?: SeatIndex; pauseMs?: number } = {}) {
    const room = this.r;
    const def = this.def();
    const d = room.deadlines;
    const prevTurns = d.turns ?? {};
    const prevBot = d.bot;
    d.turns = {};
    d.bot = undefined;
    d.auto = undefined;
    if (room.phase !== "playing") return;
    const now = Date.now();
    const auto = def.autoAdvance(room.state, room.rules);
    if (auto) {
      d.auto = now + auto.afterMs;
      return;
    }
    const current = def.currentSeats(room.state);
    const isBot = (i: number) => {
      const x = room.seats[i];
      return !!x && botControlled(x);
    };
    // Seats still waiting on the same turn keep their deadline (another match's move must not
    // reset them). New turns, including the mover's own next turn, get a full clock.
    const start = now + pauseMs;
    for (const i of current) {
      if (isBot(i)) continue;
      // Games with their own clock (chess) say exactly when time runs out.
      if (def.turnDeadline) {
        const due = def.turnDeadline(room.state, i, room.rules);
        if (due !== null) d.turns[i] = due;
        continue;
      }
      const prev = prevTurns[i];
      d.turns[i] = prev !== undefined && i !== fresh ? prev : start + room.rules.turnSeconds * 1000;
    }
    const bot = current.find(isBot);
    if (bot !== undefined) d.bot = prevBot ?? start + this.botThinkMs(bot);
  }

  /**
   * A natural-feeling pause before a bot moves, sized to the move it's about to make.
   * The alarm will run the bot with this same state and RNG position, so previewing it
   * here gives the very move it plays. The pause itself comes from a separate stream.
   */
  private botThinkMs(seat: SeatIndex): number {
    const room = this.r;
    const def = this.def();
    let range: readonly [number, number] = [300, 900];
    if (def.botThinkMs) {
      // Preview the move only when the game sizes the pause by it (arity 2): chess sizes it by
      // the clock, and previewing its search would cost CPU for nothing.
      const level = this.seatAt(seat).botLevel ?? TAKEOVER_BOT;
      const preview =
        def.botThinkMs.length > 1
          ? def.bots[level](room.state, seat, room.rules, seededRng(room.rngSeed, room.rngCounter))
          : undefined;
      range = def.botThinkMs(room.state, preview);
    }
    const [min, max] = range;
    return min + seededRng(`${room.rngSeed}:think`, room.v).int(Math.max(1, max - min + 1));
  }

  override async onAlarm() {
    const room = this.room;
    this.lastAlarm = null;
    if (!room) return;
    const def = gameFor(room.game);
    if (!def) return;

    let changed = false;
    if (room.tour || room.quick) changed = await this.tableAlarm();
    if (room.deadlines.post !== undefined && room.deadlines.post <= Date.now()) {
      await this.sendOutbox();
      changed = true;
    }
    for (let step = 0; step < MAX_ALARM_STEPS; step++) {
      const now = Date.now();
      const d = room.deadlines;

      if (d.idle !== undefined && d.idle <= now) {
        await this.destroy();
        return;
      }

      let acted = false;
      for (const [k, t] of Object.entries(d.grace)) {
        if (t !== undefined && t <= now) {
          const seat = room.seats[Number(k)];
          if (seat?.status === "away" && this.claimsOnly && room.phase === "playing") {
            // Ranked chess/draughts: no bot. The opponent may claim; their clock keeps running.
            this.applyAction(Number(k), { type: "gone", gone: true });
          } else if (seat?.status === "away") {
            seat.status = "bot";
            seat.botLevel = TAKEOVER_BOT;
            this.botTookOver(seat);
          }
          d.grace[Number(k)] = undefined;
          room.v++;
          this.schedule();
          acted = true;
        }
      }
      if (room.phase !== "playing") break;

      if (d.auto !== undefined && d.auto <= now) {
        const auto = def.autoAdvance(room.state, room.rules);
        if (auto) this.applyAction(auto.seat, auto.action);
        else this.schedule();
        acted = true;
      } else if (d.bot !== undefined && d.bot <= now) {
        d.bot = undefined; // spent; schedule() sets the next one
        const due = def.currentSeats(room.state).filter((i) => {
          const x = room.seats[i];
          return !!x && botControlled(x);
        });
        for (const seat of due) {
          if (room.phase !== "playing" || !def.currentSeats(room.state).includes(seat)) continue;
          // Strong chess bots ask the bot service; anything wrong there falls back to our engine.
          const fromService = await this.serviceBotAction(seat);
          if (fromService && this.applyAction(seat, fromService)) this.serviceFailures = 0;
          else {
            if (fromService) this.serviceFailed(); // an illegal move counts as a failure
            this.applyAction(seat, this.botAction(seat));
          }
        }
        if (!due.length) this.schedule();
        acted = true;
      } else if (Object.values(d.turns ?? {}).some((t) => t !== undefined && t <= now)) {
        const overdue = Object.entries(d.turns ?? {})
          .filter(([, t]) => t !== undefined && t <= now)
          .map(([k]) => Number(k));
        for (const seat of overdue) {
          if (room.phase !== "playing" || !def.currentSeats(room.state).includes(seat)) continue;
          const s = room.seats[seat];
          if (!s || botControlled(s)) continue;
          const rng = seededRng(room.rngSeed, room.rngCounter);
          // Some timeouts are a normal choice, not being away (letting an auction run out).
          const counts = def.timeoutCounts?.(room.state, seat) ?? true;
          const action = def.timeoutAction(room.state, seat, room.rules, rng);
          room.rngCounter = rng.counter();
          if (counts) s.timeouts++;
          if (counts && s.status === "connected" && s.timeouts >= MAX_TIMEOUTS) {
            s.status = "left"; // AFK: a bot takes over; they can still come back
            s.botLevel = TAKEOVER_BOT;
            this.botTookOver(s);
          }
          // A refused timeout (it shouldn't happen) must not leave an overdue deadline to loop on.
          if (!this.applyAction(seat, action)) this.schedule();
          if (room.phase !== "playing") break;
        }
        acted = true;
      }
      if (!acted) break;
      changed = true;
    }
    // Woken early (see persist): nothing happened, so just re-arm; no state write.
    if (!changed) return this.rearm();
    await this.persist();
    this.broadcastSnapshots();
  }

  /** A tournament table's own deadlines: start, the series' next game, the report. */
  private async tableAlarm(): Promise<boolean> {
    const room = this.r;
    const d = room.deadlines;
    const now = Date.now();
    let changed = false;
    if (room.phase === "lobby" && d.start !== undefined && d.start <= now) {
      d.start = undefined;
      await this.start();
      changed = true;
    }
    if (d.next !== undefined && d.next <= now) {
      d.next = undefined;
      if (room.phase !== "playing") await this.start();
      changed = true;
    }
    if (d.report !== undefined && d.report <= now) {
      await this.sendReport();
      changed = true;
    }
    return changed;
  }

  // ── Output ────────────────────────────────────────────────────────────────

  private send(conn: Connection, msg: ServerRoomMsg) {
    conn.send(JSON.stringify(msg));
  }

  private seatsPublic(): SeatPublic[] {
    const room = this.r;
    return room.seats.map((s, index) => ({
      index,
      userId: s.userId,
      name: s.name,
      avatar: s.avatar,
      status: s.status,
      botLevel: s.botLevel,
      ready: s.ready,
      host: !!s.userId && s.userId === room.hostUserId,
      token: s.token ?? null,
    }));
  }

  private meta(): RoomMeta {
    const room = this.r;
    return {
      roomId: room.roomId,
      code: room.code,
      kind: room.kind,
      game: room.game,
      phase: room.phase,
      ranked: false,
      rules: room.rules,
      size: room.seats.length,
      minPlayers: this.def().minPlayers,
      botFill: room.botLevel,
      firstPlayer: room.firstPlayer ?? "random",
      chat: !room.chatOff,
      spectators: [...this.getConnections<ConnState>()].filter(
        (c) => c.id !== this.closing && c.state?.seat === "spectator",
      ).length,
      ...(room.quick
        ? {
            quick: {
              ranked: room.quick.ranked,
              variant: room.quick.variant,
              timeControl: room.quick.timeControl,
              startsAt: room.phase === "lobby" ? (room.deadlines.start ?? null) : null,
            },
          }
        : {}),
      ...(room.tour
        ? {
            tournament: {
              code: room.tour.code,
              name: room.tour.name,
              stage: room.tour.stage,
              table: room.tour.table,
              label: room.tour.label,
              bestOf: room.tour.bestOf,
              wins: [...room.tour.wins],
              games: room.tour.games,
              startsAt: room.phase === "lobby" ? (room.deadlines.start ?? null) : null,
              done: room.tour.reported || room.tour.report !== null,
              reported: room.tour.reported,
            },
          }
        : {}),
    };
  }

  private snapshotFor(you: SeatIndex | "spectator"): ServerRoomMsg {
    const room = this.r;
    const def = this.def();
    const grace: Partial<Record<number, number>> = { ...room.deadlines.grace };
    return {
      t: "snapshot",
      v: room.v,
      room: this.meta(),
      seats: this.seatsPublic(),
      you,
      // Per-seat projection: never a shared payload, so hidden info can't leak.
      view: room.state === null ? null : def.view(room.state, you),
      deadlines: { turns: { ...(room.deadlines.turns ?? {}) }, graceEndsAt: grace },
      serverNow: Date.now(),
    };
  }

  private sendSnapshot(conn: Connection<ConnState>) {
    if (!this.room || !conn.state) return;
    this.send(conn, this.snapshotFor(conn.state.seat));
  }

  private broadcastSnapshots(except?: string) {
    if (!this.room) return;
    this.closing = except ?? null;
    const cache = new Map<string, string>();
    for (const c of this.getConnections<ConnState>()) {
      if (c.id === except) continue;
      const key = String(c.state?.seat ?? "spectator");
      let payload = cache.get(key);
      if (payload === undefined) {
        payload = JSON.stringify(this.snapshotFor(c.state?.seat ?? "spectator"));
        cache.set(key, payload);
      }
      c.send(payload);
    }
  }
}

/** The rules for a series' deciding game: chess at 3+2 if it was slower (draughts and the rest unchanged). */
function deciderRules(game: GameSlug, rules: RuleConfigBase): RuleConfigBase {
  if (game !== "chess") return rules;
  const r = rules as RuleConfigBase & {
    timeControl: { baseSeconds: number; incrementSeconds: number } | null;
  };
  const quick = { baseSeconds: 180, incrementSeconds: 2 };
  if (r.timeControl && r.timeControl.baseSeconds <= quick.baseSeconds) return rules;
  return { ...r, timeControl: quick } as RuleConfigBase;
}
