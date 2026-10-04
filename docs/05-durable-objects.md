# 05 — Worker & Durable Objects

`apps/realtime` is one Worker with three Durable Object classes, all **SQLite-backed** (the only kind allowed on Workers Free) and all using the **WebSocket Hibernation API** via PartyServer.

## Classes

| Class | Instances | Name | Holds |
|---|---|---|---|
| `GameRoom` | 1 per room | 6-char code (private) or ULID (quick-match) | Seats, rule config, game state, deadlines, recent action ids |
| `Matchmaker` | 1 per queue | `<game>-<size>` e.g. `whot-4` | Waiting players (in memory + socket tags) |
| `Presence` | 1 global | `global` | Online users (socket tags), invite routing |

## wrangler config

```jsonc
// apps/realtime/wrangler.jsonc
{
  "name": "gamehub-realtime",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-15", // ≤ newest date the vitest-pool-workers runtime supports
  "durable_objects": {
    "bindings": [
      { "name": "Room", "class_name": "GameRoom" },
      { "name": "Match", "class_name": "Matchmaker" },
      { "name": "Presence", "class_name": "Presence" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["GameRoom", "Matchmaker", "Presence"] }
  ],
  "vars": { "ALLOWED_ORIGINS": "https://gamehub-apps.vercel.app,http://localhost:3000", "WEB_ORIGIN": "https://gamehub-apps.vercel.app" }
  // secrets: REALTIME_TICKET_SECRET, INTERNAL_HMAC_SECRET, CHAT_SIGN_SECRET
}
```

SQLite must be enabled in the **first** migration — it can't be switched on for an already-deployed class.

## Router

```ts
// apps/realtime/src/index.ts
import { routePartykitRequest } from "partyserver";
export { GameRoom } from "./rooms/game-room";
export { Matchmaker } from "./match/matchmaker";
export { Presence } from "./presence/presence";

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (url.pathname === "/rooms" && req.method === "POST") return createPrivateRoom(req, env);
    return (
      (await routePartykitRequest(req, env, {
        locationHint: "weur",
        onBeforeConnect: async (r, lobby) => {
          const claims = await verifyTicket(r, env, scopeFor(lobby.party, lobby.name));
          if (!claims) return new Response("Unauthorized", { status: 401 });
          // pass claims to the DO via a header (request is re-created inside)
          const h = new Headers(r.headers); h.set("x-gh-claims", JSON.stringify(claims));
          return new Request(r, { headers: h });
        },
      })) ?? new Response("Not found", { status: 404 })
    );
  },
};
```

Strip any incoming `x-gh-claims` header from client requests before setting it (never trust a client-supplied value). Verify `routePartykitRequest` option names against the installed partyserver version.

## GameRoom storage

One table, one row. Keeps writes to one row per action.

```sql
CREATE TABLE IF NOT EXISTS room (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL            -- PersistedRoom
);
```

```ts
type PersistedRoom = {
  roomId: string;
  code: string | null;          // private rooms: the DO name itself (6 chars, see 08)
  kind: "private" | "quick";
  ranked: boolean;              // fixed at start: true only for quick-match that started with all humans (see 08)
  game: GameSlug;
  hostUserId: string | null;
  phase: "lobby" | "playing" | "ended";
  rules: RuleConfig;
  seats: Array<{ userId: string | null; name: string; avatar: string | null;
                 status: "empty" | "connected" | "away" | "bot" | "left";
                 botLevel?: "easy" | "medium" | "hard"; ready: boolean; timeouts: number }>;
  state: unknown;               // engine state (opaque here)
  v: number;
  rngSeed: string;              // hex, from crypto.getRandomValues at start
  rngCounter: number;           // draws consumed → reproducible
  deadlines: Deadlines;
  recentActionIds: Record<number, string[]>; // ≤ 64 per seat
  startedAt?: number; endedAt?: number;
  resultReported: boolean;
};
```

Size check: Whot 8-player state with full deck ≈ 4–6 KB JSON. Max row is 2 MB. Fine.

## Action handling (the core loop)

```ts
async onMessage(conn: Connection<ConnState>, raw: string) {
  if (raw.length > 4096) return conn.close(1009, "too big");
  if (!this.rateLimit(conn)) return send(conn, { t: "error", code: "RATE_LIMIT" });
  const msg = ClientRoomMsg.safeParse(JSON.parse(raw));
  if (!msg.success) return send(conn, { t: "error", code: "BAD_MESSAGE" });

  switch (msg.data.t) {
    case "hello": return this.sendSnapshot(conn);
    case "act": {
      const { seat, userId } = conn.state!;
      if (seat === "spectator") return;
      const { id, a } = msg.data;
      if (this.room.recentActionIds[seat]?.includes(id)) return send(conn, { t: "ack", id, v: this.room.v });

      const def = games[this.room.game];
      const rng = seededRng(this.room.rngSeed, this.room.rngCounter);
      const res = def.apply(this.room.state, { seat, action: a }, { rng, rules: this.room.rules, now: Date.now() });
      if (!res.ok) { send(conn, { t: "reject", id, code: res.error, v: this.room.v }); return this.sendSnapshot(conn); }

      this.room.state = res.state;
      this.room.rngCounter = rng.counter();
      this.room.v++;
      remember(this.room.recentActionIds, seat, id);
      this.room.seats[seat]!.timeouts = 0;
      this.scheduleTurn();                // updates deadlines.turn / deadlines.bot
      if (def.isOver(res.state)) await this.finish();
      this.persistAndReschedule();        // 1 row (+1 if alarm time changed)
      send(conn, { t: "ack", id, v: this.room.v });
      this.broadcastSnapshots(res.events);
    }
    // chat, emote, ready, config, start, report, rematch, leave …
  }
}
```

`broadcastSnapshots` iterates `this.getConnections()` and sends each connection `def.view(state, seatOrSpectator)` — **never** a shared payload when the game has hidden info.

## Bots inside the DO

- Bot turns are scheduled through `deadlines.bot = now + thinkMs` (300–900 ms, random from server RNG).
- In `onAlarm`, run bot actions in a loop while the current turn belongs to a bot **and** the bot's think time has elapsed; cap at 50 iterations per alarm.
- Persist once after the loop, broadcast once per applied action (outgoing is free, so animations stay smooth).

## Room lifecycle

| Phase | Alarm | Cleanup |
|---|---|---|
| lobby (private) | idle 10 min after last activity | `deleteAll()` and close sockets 4004 |
| playing | earliest of turn/grace/bot | — |
| ended | idle 5 min (rematch window) | report result (retry up to 3× with backoff in alarms), then `deleteAll()` |

Rematch: host sends `rematch` → same DO resets to `lobby` with same seats and rules (bots kept), new seed. No new room id → no new connections needed.

## Reporting results to web

```ts
const body = JSON.stringify(result);                 // MatchResult schema in protocol
const sig = await hmacSha256(env.INTERNAL_HMAC_SECRET, `${ts}.${body}`);
await fetch(`${env.WEB_ORIGIN}/api/internal/match-result`, {
  method: "POST", body,
  headers: { "content-type": "application/json", "x-gh-ts": String(ts), "x-gh-sig": sig },
});
```

`web` rejects if `|now - ts| > 5 min` or signature mismatches; the insert is idempotent on `roomId + startedAt`.

## Matchmaker

- Queue name `whot-4` etc. Players connect while searching; their socket tags carry `userId` and joinedAt — no storage writes.
- On join: if `waiting >= size` → create room (`Room.getByName(newId)` + RPC `init({ seats, ranked: true })`), send `matched` to those sockets, close them 1000.
- Bot fill: when the oldest waiter has waited 20 s and at least 1 human is queued, fill remaining seats with Medium bots → room `ranked: false` (shown in the UI before match starts: "Unranked — bots filled empty seats").
- Alarm only while someone waits (1 alarm write per fill window, not per join).
- Ignore a user who is already in an active room (check via Presence `inGame`).

## Presence

- Clients on any page (logged in) keep one `presence` socket. Tag = `userId`.
- Online set = distinct tags across `ctx.getWebSockets()` — survives hibernation, zero writes.
- `inGame` status: GameRoom calls `Presence` RPC on game start/end (2 requests per game).
- Invites: forward `invited` to all sockets tagged with `to`.
- Shard later by `hash(userId) % N` if one object gets hot (soft limit ~1,000 req/s per object).

## Local dev

- `wrangler dev` runs DOs locally with SQLite.
- Web points `NEXT_PUBLIC_REALTIME_HOST=localhost:8787`.

## As built (Phase 2)

- `POST /rooms` (HMAC from `web`) → Worker picks a random code → `stub.fetch("https://room/init")` with an internal header; the DO answers 409 if the code is in use and the Worker retries.
- If the host chose "Play a bot", bots are seated at creation so the lobby shows them; otherwise empty seats are bot-filled only if `botLevel` is set.
- Grace is the `GRACE_MS` var (60 s in `wrangler.jsonc`; tests use 150 ms / 3 s).
- Seats are compacted on start (empty seats dropped). Connection state (user, seat) lives in partyserver connection state (socket attachment), so hibernation costs no writes.
- Cost: ~2 rows per move (state + alarm); a best-of-3 TTT game ≈ 45 rows including lobby and start.
