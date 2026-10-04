# 09 — Chat, emotes & moderation

Three layers, all chosen:
1. **Emotes + Naija voice lines** — everywhere, zero moderation needed.
2. **Text chat in private rooms** — on by default (host can disable).
3. **Text chat in public quick-match games** — on by default, each player can turn it off for themselves.

## Emotes & voice lines

Fixed set, defined in `packages/protocol/emotes.ts` (ids, label, icon, optional sound file).

| Id | Label | Sound |
|---|---|---|
| `last_card` | "Last card!" | yes |
| `check_up` | "Check up!" | yes |
| `go_market` | "Go market!" | yes |
| `hold_on` | "Hold on!" | yes |
| `pick_two` | "Pick two!" | yes |
| `wahala` | "Wahala!" | yes |
| `omo` | "Omo…" | yes |
| `chai` | "Chai!" | yes |
| `well_played` | "Well played" | no |
| `gg` | "GG" | no |
| `hurry` | "Abeg hurry" | no |
| `lol` | 😂 | no |

Voice lines: record your own short clips (or friends'), ≤ 1.5 s, Opus in WebM + AAC fallback, ≤ 15 KB each, lazy-loaded after the game screen is interactive. Respect the user's sound setting and device mute.

Note: `last_card` emote is cosmetic. The real Whot "Last card" declaration is a **game action** (see `games/whot.md`).

## Text chat

- 200 chars max, 1 message per 2 s, newline/zero-width chars stripped, NFC-normalized.
- Filter with `obscenity` (`englishDataset` + `englishRecommendedTransformers`) **plus** a custom Naija list in `packages/protocol/moderation/naija-words.ts` (Pidgin/Yoruba/Igbo/Hausa insults you curate; keep the file server-only).
- Filtered words are censored (`****`), not blocked. 5 censored messages in 2 minutes → auto chat-mute 5 min for that room.
- Links blocked (`http`, `www.`, `.com` patterns) → message rejected with "Links aren't allowed."
- Phone numbers (≥ 10 digits) masked — protects users from sharing contacts with strangers.
- Chat is **not stored** anywhere. Each message is HMAC-signed by the DO (`sig = HMAC(CHAT_SIGN_SECRET, roomId|seat|ts|text)`) so a report can prove what was said without us keeping logs.
- Client keeps the last 50 messages in memory per room.

### Controls for players
- Mute a player (local, this game) · Block a player (persistent, also removes friendship) · Report (with reason) · Turn off chat for myself (setting: "Show chat in public games").
- Blocked users' chat and emotes are hidden client-side and the server stops delivering their chat to the blocker (the DO receives block lists via ticket claims: `blocked: string[]`, capped 200).

## Reports

- Report sends the signed message (if any) + reason to the DO → DO forwards to `web` `/api/internal/report` (signed) → `web` verifies the chat signature, stores the report.
- Auto-actions: 3 open reports against the same user from 3 different users within 24 h → automatic chat-mute 24 h (`chatMutedUntil`), report stays open for review.
- Muted users: chat input disabled with "Chat is off for you until 6:42 PM". Emotes still allowed.

## Admin panel (`/admin`, role `admin`)

- Queue of open reports (newest first), each with: reporter, target, room, reason, verified message text, target's history (past reports/actions).
- Actions: dismiss, warn (in-app notice on next login), chat-mute (1 h / 24 h / 7 d), ban (1 d / 7 d / permanent), unban.
- Ban → `bannedUntil` set → Presence closes the user's sockets with 4008 → tickets refused.
- All actions logged in `moderation_action`.
- Admin pages are dynamic, `noindex`, excluded from PWA cache.

## Public username rules

Profanity-checked on creation and change; reserved names (`admin`, `gamehub`, `moderator`, `support`, `bot`, `system`…) blocked.
