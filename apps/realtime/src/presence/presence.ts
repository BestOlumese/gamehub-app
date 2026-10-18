// Presence (docs/05-durable-objects.md → Presence): one global instance. Who's online comes from
// its sockets (one per open tab, zero writes); who's in a game or a tournament is reported by
// rooms and tournaments (two small writes a game). Friends' pages watch their friends' ids and
// hear when they come, go or start playing. Invites are checked by web, then delivered here.
import {
  clientPresenceMsg,
  CloseCode,
  INVITE_MS,
  inviteRequest,
  MAX_FRAME_BYTES,
  type FriendStatus,
  type InGame,
  type ServerPresenceMsg,
  type TicketClaims,
} from "@gamehub/protocol";
import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { CLAIMS_HEADER } from "../rooms/game-room";

/** Stale "in a game" entries (a room that never said it ended) expire after this. */
const PLAYING_MS = 6 * 60 * 60_000;

type ConnState = { userId: string; watch: string[] };
type PresenceRec = {
  games: Record<string, InGame & { until: number }>;
  tours: Record<string, { code: string; name: string; until: number }>;
};

/** The record without the given keys (no `delete` on computed keys). */
const without = <T>(rec: Record<string, T>, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(rec).filter(([k]) => !keys.includes(k)));

export class Presence extends Server<Env> {
  static override options = { hibernate: true };

  private p: PresenceRec = { games: {}, tours: {} };
  private buckets = new Map<string, { tokens: number; at: number }>();

  override onStart() {
    const sql = this.ctx.storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS presence (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)",
    );
    const row = sql.exec<{ json: string }>("SELECT json FROM presence WHERE id = 1").toArray()[0];
    if (row) this.p = JSON.parse(row.json) as PresenceRec;
  }

  private persist() {
    const now = Date.now();
    // Drop anything stale while we're writing anyway.
    this.p.games = Object.fromEntries(
      Object.entries(this.p.games).filter(([, g]) => g.until > now),
    );
    this.p.tours = Object.fromEntries(
      Object.entries(this.p.tours).filter(([, t]) => t.until > now),
    );
    this.ctx.storage.sql.exec(
      "INSERT INTO presence (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
      JSON.stringify(this.p),
    );
  }

  // ── Internal (rooms, tournaments, and invites from web via the Worker) ─────

  override async onRequest(req: Request): Promise<Response> {
    const internal = req.method === "POST" ? req.headers.get("x-gh-internal") : null;
    if (internal === "status") {
      const { userIds, inGame } = (await req.json()) as {
        userIds: string[];
        inGame: InGame | null;
      };
      const until = Date.now() + PLAYING_MS;
      if (inGame) for (const id of userIds) this.p.games[id] = { ...inGame, until };
      else this.p.games = without(this.p.games, userIds);
      this.persist();
      for (const id of userIds) this.notify(id);
      return new Response(null, { status: 200 });
    }
    if (internal === "tour") {
      const { userIds, tour } = (await req.json()) as {
        userIds: string[];
        tour: { code: string; name: string } | null;
      };
      const until = Date.now() + PLAYING_MS;
      if (tour) for (const id of userIds) this.p.tours[id] = { ...tour, until };
      else this.p.tours = without(this.p.tours, userIds);
      this.persist();
      for (const id of userIds) this.notify(id);
      return new Response(null, { status: 200 });
    }
    if (internal === "kick") {
      // A ban: close every socket of theirs here, at the table they're at and in their tournament.
      const { userId } = (await req.json()) as { userId: string };
      for (const c of this.getConnections<ConnState>())
        if (c.state?.userId === userId) c.close(CloseCode.Banned, "banned");
      const init = {
        method: "POST",
        headers: { "x-gh-internal": "kick" },
        body: JSON.stringify({ userId }),
      };
      const game = this.p.games[userId];
      const tour = this.p.tours[userId];
      await Promise.all([
        game ? this.env.Room.getByName(game.code).fetch("https://room/kick", init) : null,
        tour
          ? this.env.Tournament.getByName(tour.code).fetch("https://tournament/kick", init)
          : null,
      ]).catch(() => null);
      return new Response(null, { status: 200 });
    }
    if (internal === "invite") {
      const parsed = inviteRequest.safeParse(await req.json());
      if (!parsed.success) return new Response("bad request", { status: 400 });
      const r = parsed.data;
      const msg: ServerPresenceMsg = {
        t: "p_invite",
        invite: {
          id: crypto.randomUUID(),
          from: r.from,
          kind: r.kind,
          code: r.code,
          game: r.game,
          name: r.name,
          expiresAt: Date.now() + INVITE_MS,
        },
      };
      let delivered = false;
      for (const c of this.getConnections<ConnState>())
        if (c.state?.userId === r.to) {
          this.send(c, msg);
          delivered = true;
        }
      return Response.json({ delivered });
    }
    return new Response("Not found", { status: 404 });
  }

  // ── Sockets ───────────────────────────────────────────────────────────────

  override onConnect(conn: Connection<ConnState>, ctx: ConnectionContext) {
    const raw = ctx.request.headers.get(CLAIMS_HEADER);
    const claims = raw ? (JSON.parse(raw) as TicketClaims) : null;
    if (!claims) return conn.close(CloseCode.Unauthorized, "unauthorized");
    const wasOnline = this.online(claims.sub);
    conn.setState({ userId: claims.sub, watch: [] });
    if (!wasOnline) this.notify(claims.sub);
  }

  override onClose(conn: Connection<ConnState>) {
    this.buckets.delete(conn.id);
    const id = conn.state?.userId;
    if (id && !this.online(id, conn.id)) this.notify(id, conn.id);
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

  override onMessage(conn: Connection<ConnState>, message: WSMessage) {
    if (typeof message !== "string") return conn.close(1003, "text only");
    if (message.length > MAX_FRAME_BYTES) return conn.close(1009, "too big");
    if (!this.allow(conn)) return this.send(conn, { t: "error", code: "RATE_LIMIT" });
    let json: unknown;
    try {
      json = JSON.parse(message);
    } catch {
      return this.send(conn, { t: "error", code: "BAD_MESSAGE" });
    }
    const parsed = clientPresenceMsg.safeParse(json);
    const st = conn.state;
    if (!parsed.success || !st) return this.send(conn, { t: "error", code: "BAD_MESSAGE" });
    const msg = parsed.data;
    if (msg.t === "ping") return this.send(conn, { t: "pong", c: msg.c, s: Date.now() });
    if (msg.t === "p_watch") conn.setState({ ...st, watch: msg.userIds });
    const watch = msg.t === "p_watch" ? msg.userIds : st.watch;
    this.send(conn, {
      t: "p_status",
      statuses: Object.fromEntries(watch.map((id) => [id, this.statusOf(id)])),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Has a socket here (other than `except`, one that's closing). */
  private online(userId: string, except?: string): boolean {
    for (const c of this.getConnections<ConnState>())
      if (c.id !== except && c.state?.userId === userId) return true;
    return false;
  }

  private statusOf(userId: string, except?: string): FriendStatus {
    const now = Date.now();
    const g = this.p.games[userId];
    const t = this.p.tours[userId];
    return {
      online: this.online(userId, except),
      inGame: g && g.until > now ? { game: g.game, code: g.code, kind: g.kind } : null,
      inTournament: t && t.until > now ? { code: t.code, name: t.name } : null,
    };
  }

  /** Tells everyone watching `userId` where they are now. */
  private notify(userId: string, except?: string) {
    const status = this.statusOf(userId, except);
    for (const c of this.getConnections<ConnState>())
      if (c.id !== except && c.state?.watch.includes(userId))
        this.send(c, { t: "p_update", userId, status });
  }

  private send(conn: Connection, msg: ServerPresenceMsg) {
    conn.send(JSON.stringify(msg));
  }
}
