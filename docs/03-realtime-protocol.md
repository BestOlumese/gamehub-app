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
| `config` | `{ game; rules: RuleConfig; players: 2–8; botLevel: BotLevel \| null; firstPlayer: "random" \| "rotate" \| "lastWinner" \| "seat1"; seatBotsNow?: boolean }` | Host only, lobby only (before the first game and after each rematch). The whole setup in one message, as the Edit sheet sends it. People keep their seats in order; shrinking drops empty seats first, then bots. `TOO_MANY_PLAYERS` if more people are seated than the new count or game allows. |
| `shuffle` | `{}` | Host only, lobby only. People and bots in a random order (crypto RNG); empty seats stay at the end. Every connection is told its new seat. |
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

## As built (Phase 2)

`packages/protocol/src/room.ts` is the source of truth. Differences from the tables above:

- Client also sends `seat_bot { seat, level | null }` (host puts/removes a bot in an empty lobby seat) and `kick { seat }` (host, lobby only). `emote`, `chat` and `report` arrive with Phase 9.
- `snapshot` carries `serverNow` so the client can estimate clock offset before the first `pong`.
- Extra error codes: `NOT_HOST`, `NOT_ENOUGH_PLAYERS`, `WRONG_PHASE`.
- Plain HTTP to `/parties/*` is always 404; rooms are created only through the HMAC-signed `POST /rooms`.

### Phase 3 additions
- `snapshot.deadlines.turns` is **per seat** (`{ [seat]: endsAt }`) instead of a single `turnEndsAt`: RPS bracket matches run in parallel and one player's move must not reset another's clock.
- `RoomMeta` gains `minPlayers` and `botFill` (the level bots take empty seats at start, or null) so the lobby can label Start correctly.
- `RoomMeta.firstPlayer` (Oct 2026): who moves first in each game. `random` (default for new rooms), `rotate` (one seat along from the last game's first player), `lastWinner` (random when the winner has left), `seat1`. The room keeps a stable `key` per seat so this survives shuffles and seat changes; RPS ignores it (everyone throws together).
- `POST /rooms` takes `players` (2–8, clamped to the game) and `seatBotsNow` ("play a bot" seats bots immediately).

## New games and modes (Phase 7 onward)

Rule of thumb: **game moves stay inside `act`** (each game's `actionSchema` validates them on the server, and the shared engine validates them on the client). New envelope fields and new channels are listed here; game action shapes live in each game doc.

### `act` metrics (clocked games)
```ts
z.object({ t: z.literal("act"), id, v, a: z.unknown(),
  m: z.object({ mt: z.number().int().min(0).max(3_600_000) }).optional() }) // client-measured think time, ms; 0 for premoves
```
The room copies `m.mt` into chess/draughts move actions before `apply` (clients can't inject other clock fields). Lag compensation: `games/chess.md`.

### Game actions added (all via `act`)
| Game | Actions (`a.type`) | Notes |
|---|---|---|
| Chess | `move {uci, mt?}`, `resign`, `offer_draw`, `accept_draw`, `decline_draw`, `claim_draw`, `request_takeback`, `accept_takeback`, `decline_takeback`, `abort`, `claim_victory`, `claim_absent_draw` | `flag` is server-only (timeout action) and rejected from clients |
| Draughts | `move {from, path, mt?}`, `huff {square}`, `resign`, draw offers, takebacks | |
| Property | `roll`, `buy`, `decline`, `bid {amount}`, `pass_bid`, `build`, `sell_building`, `mortgage`, `unmortgage`, `pay_fine`, `use_bail`, `offer {offer}`, `accept_offer`, `decline_offer`, `cancel_offer`, `declare_bankruptcy`, `end_turn` | Bids and offers are actions; drafts of offers never leave the client |
| Football Draft | `pick_formation {id}`, `pick_player {id, slot?}`, `arrange {...}`, `ready`, `half_time {subs, formation?, roles?, tactics?, ready}`, `skip_playback` (solo) | Option sets arrive **only in the picking manager's view** |

### Snapshot additions
- `snapshot.view` is per seat as before. New per-game view content: chess/draughts `clock` (server time) and `legal`; property `netWorth`, `decksLeft`, the viewer's own offers; football the viewer's `DraftSeat` (others reduced to `{ pick, ready }`) and the current half's events with `startedAt`.
- `snapshot.room.tournament?: { code, stage, table }` for tournament tables.
- `snapshot.deadlines.turns` continues to carry per-seat deadlines (draft picks, half-time windows, auctions use per-room `windowEndsAt` inside the view).

### Tournament lobby channel
`/parties/tournament/<code>`, ticket scope `tournament:<code>` — messages `t_hello`, `t_join`, `t_leave`, `t_config`, `t_kick`, `t_start`, `t_cancel` (client) and `t_snapshot`, `t_event`, `t_go`, `error` (server). Zod shapes and states: `16-tournaments.md`. `POST /tournaments` (HMAC from `web`) creates one.

### Rate limits (added; per socket, on top of the 10/s action bucket)
| What | Limit | Why |
|---|---|---|
| Chess/draughts moves | 1 per 100 ms | Premoves are single, no bursts needed |
| Draw offers / takeback requests | 3 per game each, ≥ 10 plies apart after a decline | Anti-spam |
| Property bids | 4 per second | Fast auctions without floods |
| Property trade offers | 1 per 2 s, ≤ 2 open sent per player | Anti-spam |
| Football picks | 1 per 300 ms | Accidental double taps |
| Tournament lobby messages | 2 per second | |
| Tournament `t_config` | 1 per second, host only, lobby only | |

### New error codes
`TOURNAMENT_FULL`, `BAD_STAGES`, `NOT_IN_TOURNAMENT`, `TABLE_NOT_READY`. Rule errors added to `RuleErrorCode`: `NOT_ENOUGH_CASH`, `MUST_RAISE_CASH`, `UNEVEN_BUILDING`, `NO_SUCH_OFFER`, `OFFER_EXPIRED`, `PICK_NOT_ACTIVE`, `BAD_FORMATION`, `ILLEGAL_CAPTURE`, `MUST_CAPTURE`, `TAKEBACK_DENIED`, `CLOCK_FLAGGED`.
