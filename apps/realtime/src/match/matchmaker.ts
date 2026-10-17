// Quick match (docs/08-matchmaking-ratings.md). One global instance holds every queue, so a
// person can only ever be in one queue or one game. Queues fill first come, first served; a full
// queue of people is ranked. After 20 s, bots take the empty seats (unranked) unless you chose to
// keep waiting (then up to 3 minutes). The room is an ordinary GameRoom with fixed seats.
import { BOT_FILL_MS, MAX_WAIT_MS, queueOf, type Queue } from "@gamehub/engine/matchmaking";
import {
  clientMatchMsg,
  CloseCode,
  MAX_FRAME_BYTES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ClientMatchMsg,
  type QueueStatus,
  type ServerMatchMsg,
  type TableInit,
  type TicketClaims,
} from "@gamehub/protocol";
import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { CLAIMS_HEADER } from "../rooms/game-room";

/** Someone is "in a game" this long at most, even if the room never says they're free. */
const BUSY_MS = 3 * 60 * 60_000;

type Person = { userId: string; name: string; avatar: string | null };
type Waiting = Person & { joinedAt: number; keep: boolean };
type QueueRec = { queue: Queue; waiting: Waiting[] };

type MatchRec = {
  queues: Record<string, QueueRec>;
  /** Who's in a game, and until when we assume so. */
  busy: Record<string, { code: string; until: number }>;
};

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

/** The record without `key` (no `delete` on computed keys). */
function without<T>(rec: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(rec).filter(([k]) => k !== key));
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (crypto.getRandomValues(new Uint32Array(1))[0] as number) % (i + 1);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export class Matchmaker extends Server<Env> {
  static override options = { hibernate: true };

  private m: MatchRec = { queues: {}, busy: {} };
  private lastAlarm: number | null = null;
  private buckets = new Map<string, { tokens: number; at: number }>();
  /** People told they timed out, until they next say hello (in memory). */
  private timedOut = new Set<string>();

  override onStart() {
    const sql = this.ctx.storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS mm (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)",
    );
    const row = sql.exec<{ json: string }>("SELECT json FROM mm WHERE id = 1").toArray()[0];
    if (row) this.m = JSON.parse(row.json) as MatchRec;
  }

  private async persist() {
    this.ctx.storage.sql.exec(
      "INSERT INTO mm (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
      JSON.stringify(this.m),
    );
    const times: number[] = [];
    for (const q of Object.values(this.m.queues))
      for (const w of q.waiting)
        times.push(w.keep ? w.joinedAt + MAX_WAIT_MS : w.joinedAt + BOT_FILL_MS);
    const next = times.length ? Math.min(...times) : null;
    if (next === null) {
      if (this.lastAlarm !== null) await this.ctx.storage.deleteAlarm();
      this.lastAlarm = null;
    } else if (this.lastAlarm === null || next < this.lastAlarm) {
      await this.ctx.storage.setAlarm(next);
      this.lastAlarm = next;
    }
  }

  // ── Internal (rooms say their players are free) ────────────────────────────

  override async onRequest(req: Request): Promise<Response> {
    if (req.method !== "POST" || req.headers.get("x-gh-internal") !== "free")
      return new Response("Not found", { status: 404 });
    const { userIds, code } = (await req.json()) as { userIds: string[]; code: string };
    let changed = false;
    for (const id of userIds) {
      if (this.m.busy[id]?.code === code) {
        this.m.busy = without(this.m.busy, id);
        changed = true;
      }
    }
    if (changed) await this.persist();
    for (const c of this.getConnections<Person>())
      if (c.state && userIds.includes(c.state.userId)) this.sendState(c);
    return new Response(null, { status: 200 });
  }

  // ── Sockets ───────────────────────────────────────────────────────────────

  override onConnect(conn: Connection<Person>, ctx: ConnectionContext) {
    const raw = ctx.request.headers.get(CLAIMS_HEADER);
    const claims = raw ? (JSON.parse(raw) as TicketClaims) : null;
    if (!claims) return conn.close(CloseCode.Unauthorized, "unauthorized");
    for (const c of this.getConnections<Person>())
      if (c.id !== conn.id && c.state?.userId === claims.sub)
        c.close(CloseCode.Replaced, "replaced");
    conn.setState({ userId: claims.sub, name: claims.name, avatar: claims.avatar });
  }

  /** Leaving the queue page leaves the queue (the page re-joins when it reconnects). */
  override async onClose(conn: Connection<Person>) {
    this.buckets.delete(conn.id);
    const st = conn.state;
    if (!st) return;
    const still = [...this.getConnections<Person>()].some(
      (c) => c.id !== conn.id && c.state?.userId === st.userId,
    );
    if (!still && this.remove(st.userId)) await this.commit();
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

  override async onMessage(conn: Connection<Person>, message: WSMessage) {
    if (typeof message !== "string") return conn.close(1003, "text only");
    if (message.length > MAX_FRAME_BYTES) return conn.close(1009, "too big");
    if (!this.allow(conn)) return this.send(conn, { t: "error", code: "RATE_LIMIT" });
    let json: unknown;
    try {
      json = JSON.parse(message);
    } catch {
      return this.send(conn, { t: "error", code: "BAD_MESSAGE" });
    }
    const parsed = clientMatchMsg.safeParse(json);
    const me = conn.state;
    if (!parsed.success || !me) return this.send(conn, { t: "error", code: "BAD_MESSAGE" });
    await this.handle(parsed.data, me, conn);
  }

  private async handle(msg: ClientMatchMsg, me: Person, conn: Connection<Person>) {
    const now = Date.now();
    switch (msg.t) {
      case "ping":
        return this.send(conn, { t: "pong", c: msg.c, s: now });
      case "mm_hello":
        this.timedOut.delete(me.userId);
        return this.sendState(conn);
      case "mm_join": {
        const q = queueOf({
          game: msg.queue.game,
          players: msg.queue.players,
          timeControl: msg.queue.timeControl ?? null,
          variant: msg.queue.variant ?? null,
        });
        if (!q) return this.send(conn, { t: "error", code: "BAD_QUEUE" });
        if (this.busyCode(me.userId)) return this.sendState(conn);
        this.timedOut.delete(me.userId);
        const already = this.m.queues[q.key]?.waiting.find((w) => w.userId === me.userId);
        if (already) return this.sendState(conn);
        this.remove(me.userId); // one queue at a time
        const rec = (this.m.queues[q.key] ??= { queue: q, waiting: [] });
        rec.waiting.push({ ...me, joinedAt: now, keep: false });
        await this.match(q.key);
        return this.commit();
      }
      case "mm_wait": {
        const w = this.findWaiting(me.userId);
        if (!w) return this.sendState(conn);
        w.entry.keep = msg.keep;
        // Back to bots after the 20 s have passed: they come now.
        await this.match(w.key);
        return this.commit();
      }
      case "mm_leave":
        if (this.remove(me.userId)) await this.commit();
        else this.sendState(conn);
        return;
    }
  }

  override async onAlarm() {
    this.lastAlarm = null;
    for (const key of Object.keys(this.m.queues)) await this.match(key);
    await this.commit();
  }

  // ── Matching ──────────────────────────────────────────────────────────────

  /**
   * Makes every room the queue can: full tables of people (ranked); then anyone who has waited
   * 20 s without choosing to keep waiting gets bots in the empty seats (unranked); and anyone who
   * kept waiting past 3 minutes is dropped.
   */
  private async match(key: string) {
    const rec = this.m.queues[key];
    if (!rec) return;
    const { queue } = rec;
    const now = Date.now();
    while (rec.waiting.length >= queue.size) {
      const group = rec.waiting.slice(0, queue.size);
      if (!(await this.makeRoom(queue, group, queue.ranked))) break;
      rec.waiting = rec.waiting.slice(queue.size);
    }
    for (;;) {
      const due = rec.waiting.find((w) => !w.keep && now - w.joinedAt >= BOT_FILL_MS);
      if (!due) break;
      const group = [due, ...rec.waiting.filter((w) => w !== due && !w.keep)].slice(0, queue.size);
      if (!(await this.makeRoom(queue, group, false))) break;
      rec.waiting = rec.waiting.filter((w) => !group.includes(w));
    }
    for (const w of rec.waiting.filter((x) => x.keep && now - x.joinedAt >= MAX_WAIT_MS)) {
      rec.waiting = rec.waiting.filter((x) => x !== w);
      this.timedOut.add(w.userId);
    }
    if (!rec.waiting.length) this.m.queues = without(this.m.queues, key);
  }

  /** A room for `group`, bots in any seats left; tells each person to go. */
  private async makeRoom(queue: Queue, group: Waiting[], ranked: boolean): Promise<boolean> {
    const bots = queue.size - group.length;
    const seats: TableInit["seats"] = shuffled([
      ...group.map((p) => ({
        entrant: p.userId,
        userId: p.userId,
        name: p.name,
        avatar: p.avatar,
        bot: null,
      })),
      ...Array.from({ length: bots }, (_, i) => ({
        entrant: `bot${i}`,
        userId: null,
        name: bots > 1 ? `Bot ${i + 1} (Medium)` : "Bot (Medium)",
        avatar: null,
        bot: "medium" as const,
      })),
    ]);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const init: TableInit = {
        code,
        game: queue.game,
        rules: queue.rules,
        seats,
        quick: { queue: queue.key, ranked, variant: queue.variant, timeControl: queue.timeControl },
        spectators: true,
        entrantUserIds: [],
      };
      let res: Response;
      try {
        res = await this.env.Room.getByName(code, { locationHint: "weur" }).fetch(
          "https://room/table",
          { method: "POST", headers: { "x-gh-internal": "table" }, body: JSON.stringify(init) },
        );
      } catch {
        return false;
      }
      if (res.status === 409) continue;
      if (res.status !== 201) return false;
      const until = Date.now() + BUSY_MS;
      for (const p of group) this.m.busy[p.userId] = { code, until };
      for (const c of this.getConnections<Person>())
        if (c.state && group.some((p) => p.userId === c.state?.userId))
          this.send(c, { t: "mm_go", code, ranked });
      return true;
    }
    return false;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private busyCode(userId: string): string | null {
    const b = this.m.busy[userId];
    if (!b) return null;
    if (b.until < Date.now()) {
      this.m.busy = without(this.m.busy, userId);
      return null;
    }
    return b.code;
  }

  private findWaiting(userId: string): { key: string; entry: Waiting } | null {
    for (const [key, q] of Object.entries(this.m.queues)) {
      const entry = q.waiting.find((w) => w.userId === userId);
      if (entry) return { key, entry };
    }
    return null;
  }

  private remove(userId: string): boolean {
    const w = this.findWaiting(userId);
    if (!w) return false;
    const q = this.m.queues[w.key] as QueueRec;
    q.waiting = q.waiting.filter((x) => x.userId !== userId);
    if (!q.waiting.length) this.m.queues = without(this.m.queues, w.key);
    return true;
  }

  private statusFor(userId: string): QueueStatus {
    const code = this.busyCode(userId);
    if (code) return { status: "busy", code };
    if (this.timedOut.has(userId)) return { status: "timed_out" };
    const w = this.findWaiting(userId);
    if (!w) return { status: "idle" };
    const q = this.m.queues[w.key] as QueueRec;
    return {
      status: "queued",
      queue: w.key,
      game: q.queue.game,
      size: q.queue.size,
      ranked: q.queue.ranked,
      found: [w.entry, ...q.waiting.filter((x) => x !== w.entry)].map((x) => ({
        name: x.name,
        avatar: x.avatar,
        you: x.userId === userId,
      })),
      joinedAt: w.entry.joinedAt,
      botsAt: w.entry.keep ? null : w.entry.joinedAt + BOT_FILL_MS,
      giveUpAt: w.entry.keep ? w.entry.joinedAt + MAX_WAIT_MS : null,
    };
  }

  private send(conn: Connection, msg: ServerMatchMsg) {
    conn.send(JSON.stringify(msg));
  }

  private sendState(conn: Connection<Person>) {
    if (!conn.state) return;
    this.send(conn, { t: "mm_state", serverNow: Date.now(), ...this.statusFor(conn.state.userId) });
  }

  /** Saves, and tells everyone connected where they stand. */
  private async commit() {
    await this.persist();
    for (const c of this.getConnections<Person>()) this.sendState(c);
  }
}
