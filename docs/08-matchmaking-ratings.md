# 08 — Rooms, matchmaking, ratings, leaderboards

## Private rooms

1. Host picks game → player count → rules (preset "Naija Standard" or customize) → turn timer → bots on/off and bot level → "Create room".
2. `web` server action calls Worker `POST /rooms` (signed) → room DO initialised in `lobby` → returns `roomId` + 6-char code.
3. Share sheet: **WhatsApp** (`https://wa.me/?text=…`), copy link, copy code. Link: `https://gamehub-apps.vercel.app/r/<code>`.
4. `/r/<code>` opens the room (see "Room codes" below).
5. Lobby shows seats, ready states, rules summary. Host can change rules until start, kick (lobby only), add/remove bots per seat.
6. Start: host taps start when ≥ min players (humans + bots). Empty seats: filled by bots if host enabled "Fill with bots", else seat count shrinks to occupied seats (must stay ≥ game minimum).

**Room codes**: no lookup table. A private room's Durable Object is **named by its code**, so `/r/ABC234` connects straight to `room/ABC234`. Codes are 6 random characters from a 31-symbol alphabet without look-alikes (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, ~887M combinations). On creation the Worker asks that DO whether it's already in use and regenerates on collision. Codes are freed when the room is cleaned up. Quick-match rooms are named by ULID.

Private rooms are **never ranked**.

## Public quick-match

- Player picks **game + player count** (Whot 2–8, Ludo 2–4, Snakes 2–8, Tic-tac-toe 2, RPS 2–8). Rules = Naija Standard (fixed, so everyone knows what they're getting). Turn timer = 30 s.
- Connects to `Matchmaker` `<game>-<size>`.
- Fills FIFO. When `size` humans wait → room created, **ranked**.
- Bot fill: after **20 s** waiting with ≥ 1 human, remaining seats filled with Medium bots → **unranked**. UI shows a countdown "Bots join in 0:12" and an option "Keep waiting for players" (opt out of bot fill; then max wait 3 min).
- Mid-game: if a human in a ranked game leaves or disconnects and a bot takes the seat, the game **stays ranked**; the departed player is ranked by their final position, with `left` players placed last. (Rating only counts humans; the bot's result is ignored for rating math — ratings are computed over the human players' relative order.)
- A user can only be in one queue or one active playing seat at a time.

## Ratings (openskill)

- Model: Plackett-Luce (supports any number of players and ties).
- Stored per user per game: `mu`, `sigma`, `ordinal = mu − 3σ` (conservative display).
- Display rating = `round(1000 + ordinal * 40)` floored at 0 → friendly numbers (new player ≈ 1000).
- Computed in `web` on match ingest (ranked only), within the same transaction as inserting `match`/`match_player`.

```ts
import { rate, rating, ordinal } from "openskill";
// teams: each human is a 1-person team; rank = place (ties share a place)
const before = humans.map((h) => rating({ mu: h.mu, sigma: h.sigma }));
const after = rate(before.map((r) => [r]), { rank: humans.map((h) => h.place) });
```

Verify the exact `openskill` JS API at install time.

- Placement: first 10 ranked games per game show "Placement 3/10" instead of a rating on leaderboards.
- Anti-farming: ranked only from quick-match; same two users meeting more than 5 times in 24 h in ranked → later games unranked for that pair (cheap check on ingest).

## Leaderboards

- Per game: **Weekly** (rating gained since Monday 00:00 Lagos, min 5 games) and **All-time** (ordinal, min 10 games).
- Top 100 + "your position" row.
- Cached; revalidated on ingest.

## Match history & stats

- Profile: per game played/won/win-rate/current streak/best streak/rating.
- Last 20 matches with game, players, place, rating change, date. Tapping one shows the final standings (no replay in v1).

## Spectating

- Any room can be watched via link or from a friend's profile when they're `inGame` — unless the host turned **"Allow spectators"** off (default on for private, on for quick-match).
- Spectators: see board, discards, card counts — never hands. Can send emotes (rate-limited), cannot chat in quick-match rooms, can chat in private rooms if host allows.
- Max 20 spectators per room.
- No spectator delay: hands are never sent to spectators and boards are public anyway, so live viewing can't leak anything useful.

## Friends

- Add by username or from a player card in a game.
- Friend request → accept/decline. Block removes friendship and hides chat both ways.
- Friends list shows online / in game (via Presence) with "Invite" and "Watch" buttons.
- Invite → toast + in-page notification on the friend's screen (if online); invite expires in 2 min.
