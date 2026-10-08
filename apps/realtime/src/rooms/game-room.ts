import {
  seededRng,
  type GameSlug,
  type RuleConfigBase,
  type RuleErrorCode,
  type SeatIndex,
} from "@gamehub/engine";
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
  type TicketClaims,
} from "@gamehub/protocol";
import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
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
const TAKEOVER_BOT: BotLevel = "medium";

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
};

/** Everything about the room, stored as ONE row so each change costs one write. */
type PersistedRoom = {
  roomId: string;
  code: string;
  kind: "private";
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
  /** Seat keys of the last game's first player and winner ("Takes turns", "Last winner"). */
  lastFirstKey?: string | undefined;
  lastWinnerKey?: string | undefined;
  startedAt?: number | undefined;
  endedAt?: number | undefined;
};

type ConnState = {
  userId: string;
  name: string;
  avatar: string | null;
  seat: SeatIndex | "spectator";
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
    if (req.method !== "POST" || req.headers.get("x-gh-internal") !== "init") {
      return new Response("Not found", { status: 404 });
    }
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
    let changed = false;
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
      } else seat = "spectator";
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

    conn.setState({ userId: claims.sub, name: claims.name, avatar: claims.avatar, seat });
    if (changed) {
      if (room.phase === "lobby") room.deadlines.idle = Date.now() + LOBBY_IDLE_MS;
      if (room.phase === "playing") this.schedule();
      room.v++;
      await this.persist();
      this.broadcastSnapshots();
    }
    // The client asks for its snapshot with "hello".
  }

  override async onClose(conn: Connection<ConnState>) {
    this.buckets.delete(conn.id);
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
    if (msg.t === "hello") return this.sendSnapshot(conn);
    if (msg.t === "ping") return this.send(conn, { t: "pong", c: msg.c, s: Date.now() });
    if (st.seat === "spectator") return;

    const err = await this.handle(msg, st.seat, st.userId, conn);
    if (err) this.send(conn, { t: "error", code: err });
  }

  private async handle(
    msg: Exclude<ClientRoomMsg, { t: "hello" | "ping" }>,
    seat: SeatIndex,
    userId: string,
    conn: Connection<ConnState>,
  ): Promise<RoomErrorCode | null> {
    const room = this.r;
    const isHost = room.hostUserId === userId;

    switch (msg.t) {
      case "act":
        return this.act(conn, seat, msg.id, msg.a);

      case "ready": {
        if (room.phase !== "lobby") return "WRONG_PHASE";
        this.seatAt(seat).ready = msg.ready;
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
        for (const s of room.seats) {
          if (s.status === "left" || s.status === "away") Object.assign(s, emptySeat());
          if (s.userId) s.ready = false;
          s.timeouts = 0;
        }
        room.phase = "lobby";
        room.state = null;
        room.recentActionIds = {};
        room.deadlines = { grace: {}, idle: Date.now() + LOBBY_IDLE_MS };
        if (!room.seats.some((s) => s.userId === room.hostUserId)) {
          const next = room.seats.find((s) => s.userId);
          if (next?.userId) room.hostUserId = next.userId;
        }
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
    room.seats = seats;
    this.reseatConnections();
    return this.commit();
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
    if (room.phase === "lobby") room.deadlines.idle = Date.now() + LOBBY_IDLE_MS;
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
    room.state = def.setup(room.seats.length, { rng, rules: room.rules, now: Date.now() }, first);
    room.rngCounter = rng.counter();
    room.phase = "playing";
    room.startedAt = Date.now();
    room.endedAt = undefined;
    room.recentActionIds = {};
    room.deadlines = { grace: {} };
    room.seats.forEach((s, i) => {
      s.timeouts = 0;
      if (s.status === "away") room.deadlines.grace[i] = Date.now() + this.graceMs;
    });
    this.reseatConnections();
    this.schedule();
    room.v++;
    await this.persist();
    this.broadcastSnapshots();
    return null;
  }

  private async leave(seat: SeatIndex, conn: Connection<ConnState>): Promise<RoomErrorCode | null> {
    const room = this.r;
    const s = this.seatAt(seat);
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
    room.phase = "ended";
    room.endedAt = Date.now();
    room.deadlines = { grace: {}, idle: Date.now() + ENDED_IDLE_MS };
    const ranking = def.ranking(room.state);
    const winner = ranking[0]?.[0];
    room.lastWinnerKey = winner === undefined ? undefined : room.seats[winner]?.key;
    this.broadcast(
      JSON.stringify({ t: "ended", v: room.v, ranking, ranked: false } satisfies ServerRoomMsg),
    );
    // Private rooms are never ranked; match reporting to web arrives with Phase 7.
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
      const level = this.seatAt(seat).botLevel ?? TAKEOVER_BOT;
      const rng = seededRng(room.rngSeed, room.rngCounter);
      range = def.botThinkMs(room.state, def.bots[level](room.state, seat, room.rules, rng));
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
          if (seat?.status === "away") {
            seat.status = "bot";
            seat.botLevel = TAKEOVER_BOT;
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
          this.applyAction(seat, this.botAction(seat));
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
          const action = def.timeoutAction(room.state, seat, room.rules, rng);
          room.rngCounter = rng.counter();
          s.timeouts++;
          if (s.status === "connected" && s.timeouts >= MAX_TIMEOUTS) {
            s.status = "left"; // AFK: a bot takes over; they can still come back
            s.botLevel = TAKEOVER_BOT;
          }
          this.applyAction(seat, action);
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

  private broadcastSnapshots() {
    if (!this.room) return;
    const cache = new Map<string, string>();
    for (const c of this.getConnections<ConnState>()) {
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
