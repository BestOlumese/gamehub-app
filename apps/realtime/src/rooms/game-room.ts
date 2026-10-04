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
const RECENT_IDS = 64;
const TAKEOVER_BOT: BotLevel = "medium";

type SeatRec = {
  userId: string | null;
  name: string;
  avatar: string | null;
  status: SeatStatus;
  botLevel: BotLevel | null;
  ready: boolean;
  timeouts: number;
};

type Deadlines = {
  turn?: number | undefined;
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

const botSeat = (level: BotLevel): SeatRec => ({
  userId: null,
  name: `Bot (${level.charAt(0).toUpperCase()}${level.slice(1)})`,
  avatar: null,
  status: "bot",
  botLevel: level,
  ready: true,
  timeouts: 0,
});

/** Seats a bot plays: actual bots, and humans who are gone (grace expired or left). */
const botControlled = (s: SeatRec) => s.status === "bot" || s.status === "left";

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

  /** One row write, plus an alarm write only when the earliest deadline moved. */
  private async persist() {
    const room = this.room;
    if (!room) return;
    this.ctx.storage.sql.exec(
      "INSERT INTO room (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
      JSON.stringify(room),
    );
    const d = room.deadlines;
    const times = [d.turn, d.bot, d.auto, d.idle, ...Object.values(d.grace)].filter(
      (t): t is number => typeof t === "number",
    );
    const next = times.length ? Math.min(...times) : null;
    if (next !== this.lastAlarm) {
      if (next === null) await this.ctx.storage.deleteAlarm();
      else await this.ctx.storage.setAlarm(next);
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

    const seats = Array.from({ length: def.maxPlayers }, emptySeat);
    seats[0] = {
      ...emptySeat(),
      userId: host.userId,
      name: host.name,
      avatar: host.avatar,
      status: "away",
    };
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
        const def = this.def();
        const rules = def.ruleSchema.safeParse(msg.rules);
        if (!rules.success) return "BAD_MESSAGE";
        room.rules = rules.data;
        return this.commit();
      }

      case "seat_bot": {
        if (room.phase !== "lobby") return "WRONG_PHASE";
        if (!isHost) return "NOT_HOST";
        const target = room.seats[msg.seat];
        if (!target || target.userId) return "BAD_MESSAGE";
        room.seats[msg.seat] = msg.level ? botSeat(msg.level) : emptySeat();
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

    room.rngSeed = randomHex(16);
    room.rngCounter = 0;
    const rng = seededRng(room.rngSeed);
    room.state = def.setup(room.seats.length, { rng, rules: room.rules, now: Date.now() });
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
    // Seat indexes may have shifted; tell each connection its new seat.
    for (const c of this.getConnections<ConnState>()) {
      const st = c.state;
      if (!st) continue;
      const idx = room.seats.findIndex((s) => s.userId === st.userId);
      c.setState({ ...st, seat: idx >= 0 ? idx : "spectator" });
    }
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
  private applyAction(
    seat: SeatIndex,
    action: unknown,
    onReject?: (code: RuleErrorCode) => void,
  ): boolean {
    const room = this.r;
    const def = this.def();
    const rng = seededRng(room.rngSeed, room.rngCounter);
    const res = def.apply(
      room.state,
      { seat, action },
      { rng, rules: room.rules, now: Date.now() },
    );
    if (!res.ok) {
      onReject?.(res.error);
      return false;
    }
    room.state = res.state;
    room.rngCounter = rng.counter();
    room.v++;
    for (const e of res.events)
      this.broadcast(JSON.stringify({ t: "event", v: room.v, e } satisfies ServerRoomMsg));
    if (def.isOver(res.state)) this.finish();
    else this.schedule();
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
    this.broadcast(
      JSON.stringify({ t: "ended", v: room.v, ranking, ranked: false } satisfies ServerRoomMsg),
    );
    // Private rooms are never ranked; match reporting to web arrives with Phase 7.
  }

  /** Recomputes the turn / bot / auto-advance deadlines from the current state. */
  private schedule() {
    const room = this.r;
    const def = this.def();
    const d = room.deadlines;
    d.turn = undefined;
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
    if (
      current.some((i) => {
        const x = room.seats[i];
        return !!x && botControlled(x);
      })
    ) {
      // Natural-feeling think time from the room's RNG, without consuming the game stream.
      d.bot = now + 300 + seededRng(`${room.rngSeed}:think`, room.v).int(600);
    }
    if (
      current.some((i) => {
        const x = room.seats[i];
        return !!x && !botControlled(x);
      })
    ) {
      d.turn = now + room.rules.turnSeconds * 1000;
    }
  }

  override async onAlarm() {
    const room = this.room;
    this.lastAlarm = null;
    if (!room) return;
    const def = gameFor(room.game);
    if (!def) return;

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
        const seat = def.currentSeats(room.state).find((i) => {
          const x = room.seats[i];
          return !!x && botControlled(x);
        });
        if (seat !== undefined) {
          const rng = seededRng(room.rngSeed, room.rngCounter);
          const level = this.seatAt(seat).botLevel ?? TAKEOVER_BOT;
          const action = def.bots[level](room.state, seat, room.rules, rng);
          room.rngCounter = rng.counter();
          this.applyAction(seat, action);
        } else this.schedule();
        acted = true;
      } else if (d.turn !== undefined && d.turn <= now) {
        for (const seat of def.currentSeats(room.state)) {
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
    }
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
      deadlines: { turnEndsAt: room.deadlines.turn, graceEndsAt: grace },
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
