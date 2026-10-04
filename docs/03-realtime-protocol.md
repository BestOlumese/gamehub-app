# 03 — Realtime protocol

All messages are JSON, validated with Zod schemas from `packages/protocol` on **both** ends. Messages are small (< 2 KB typical), so JSON is fine; outgoing messages are free on Cloudflare.

## Endpoints (Worker)

| Path | DO | Purpose |
|---|---|---|
| `/parties/presence/global` | PresenceDO | Online status, friend invites, notifications (one socket per tab while on site) |
| `/parties/match/<game>-<size>` | MatchmakerDO | Quick-match queue |
| `/parties/room/<roomId>` | GameRoomDO | A game (players + spectators) |
| `POST /rooms` (HTTP) | GameRoomDO | Create private room → returns `roomId` + code |

All WS upgrades require `?ticket=<jwt>` and an allowed `Origin`.

## Ticket (JWT, HS256, 60 s)

```ts
type TicketClaims = {
  sub: string;          // user id
  name: string;         // username
  avatar: string | null;
  scope: "presence" | `match:${string}` | `room:${string}`;
  iat: number; exp: number;
};
```

Issued by `web` at `GET /api/realtime/ticket?scope=…`. Secret `REALTIME_TICKET_SECRET` shared by Vercel and the Worker (Wrangler secret).

```ts
// apps/realtime/src/auth.ts
import { jwtVerify } from "jose";
export async function verifyTicket(req: Request, env: Env, expectedScope: string) {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");
  if (!origin || !env.ALLOWED_ORIGINS.split(",").includes(origin)) return null;
  const token = url.searchParams.get("ticket");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.REALTIME_TICKET_SECRET), {
      algorithms: ["HS256"], maxTokenAge: "60s",
    });
    return payload.scope === expectedScope ? (payload as TicketClaims) : null;
  } catch { return null; }
}
```

## Envelope

Every message has a short type key `t`.

### Client → server (room)

| `t` | Payload | Notes |
|---|---|---|
| `hello` | `{ lastV?: number }` | First message after connect. Server replies with `snapshot`. |
| `act` | `{ id: string; v: number; a: GameAction }` | `id` = client UUID (idempotency). `v` = state version the client acted on. |
| `ready` | `{ ready: boolean }` | Lobby only. |
| `config` | `{ rules: RuleConfig }` | Host only, lobby only. |
| `start` | `{}` | Host only; fills empty seats with bots if `fillBots`. |
| `emote` | `{ e: EmoteId }` | Rate limited. |
| `chat` | `{ text: string }` | ≤ 200 chars, rate limited, filtered. |
| `report` | `{ msg: SignedChat; reason: ReportReason }` | |
| `rematch` | `{}` | After `ended`. |
| `leave` | `{}` | Voluntary leave (bot takes seat immediately, no grace). |
| `ping` | `{ c: number }` | App-level RTT measurement (client timestamp). Optional. |

### Server → client (room)

| `t` | Payload |
|---|---|
| `snapshot` | `{ v; room: RoomMeta; seats: SeatPublic[]; you: SeatIndex \| "spectator"; view: GameView; deadlines: { turnEndsAt?: number; graceEndsAt?: Record<SeatIndex, number> } }` |
| `ack` | `{ id; v }` — your action applied; a `snapshot` with the same `v` follows/precedes. |
| `reject` | `{ id; code: RuleErrorCode; v }` — followed by a fresh `snapshot`. |
| `event` | `{ v; e: GameEvent }` — for animation/sound only ("pick2", "general_market", "captured", "snake"). Never needed for correctness. |
| `seat` | `{ seat; status: "connected" \| "away" \| "bot" \| "left" }` |
| `emote` | `{ seat; e }` |
| `chat` | `SignedChat = { seat; name; text; ts; sig }` |
| `ended` | `{ v; ranking: SeatIndex[][]; ranked: boolean; ratingDeltas?: Record<SeatIndex, number> }` |
| `pong` | `{ c; s: number }` |
| `error` | `{ code: "UNAUTHORIZED" \| "ROOM_FULL" \| "NOT_FOUND" \| "CAPACITY" \| "RATE_LIMIT" \| "BAD_MESSAGE" }` |

**Design choice: full per-seat snapshot on every change.** Views are small (a Whot hand is ≤ ~20 cards, a Ludo board is 16 seed positions). Sending the whole view every time makes reconnection trivial (no patch replay), removes desync bugs, and costs nothing (outgoing is free). `event` messages are only decoration.

### Versioning
- `v` increments on every accepted state change.
- Client ignores any `snapshot` with `v` lower than its current one.
- An `act` with stale `v` is still evaluated against current state (it's an intent); it's rejected only if illegal now.

### Idempotency
- DO keeps the last 64 processed action `id`s per seat in the persisted state (tiny). A duplicate `id` gets `ack` again without re-applying.

## Matchmaker messages

| Direction | `t` | Payload |
|---|---|---|
| C→S | `join` | `{}` (game+size are in the room name) |
| C→S | `cancel` | `{}` |
| S→C | `queue` | `{ position; waiting; botFillAt: number }` |
| S→C | `matched` | `{ roomId; ranked: boolean }` |

## Presence messages

| Direction | `t` | Payload |
|---|---|---|
| C→S | `watch` | `{ userIds: string[] }` (friends, ≤ 200) |
| S→C | `online` | `{ userIds: string[] }` (full set, then deltas via `presence`) |
| S→C | `presence` | `{ userId; online: boolean; inGame?: GameSlug }` |
| C→S | `invite` | `{ to: string; roomId; game }` |
| S→C | `invited` | `{ from: {id,name,avatar}; roomId; game; expiresAt }` |

Invites are only delivered if `to` is a friend of `from` — the Worker checks via a signed HTTP call to `web` (`/api/internal/friends/check`) cached 5 min in DO memory.

## Limits (enforced server-side)

| Limit | Value |
|---|---|
| Max incoming message size | 4 KB (close socket with 1009 above) |
| Actions | 10/s per socket, burst 20 |
| Emotes | 1 per 2 s |
| Chat | 1 per 2 s, 200 chars, 5 consecutive filtered messages → auto-mute 5 min |
| Spectators per room | 20 |
| Sockets per user per room | 1 (new connection replaces the old one with close code 4001 "replaced") |

## Close codes

| Code | Meaning | Client action |
|---|---|---|
| 1000 | Normal | Don't reconnect |
| 4001 | Replaced by another tab | Show "Opened in another tab"; don't reconnect |
| 4003 | Unauthorized / ticket bad | Refresh ticket once; if fails, go to login |
| 4004 | Room not found / ended | Go to room-ended screen |
| 4008 | Kicked / banned | Show reason, don't reconnect |
| 4029 | Rate limited | Reconnect after backoff |
| other | Network | Reconnect with backoff |
