# 09 — Chat, emotes & moderation

Three layers, all chosen:
1. **Emotes + Naija voice lines** — everywhere, zero moderation needed.
2. **Text chat in private rooms** — on by default (host can disable).
3. **Text chat in public quick-match games** — on by default, each player can turn it off for themselves.

## Emotes & voice lines

Fixed set, defined in `packages/protocol/src/chat.ts` (`EMOTES`: id and label). As built every emote plays a soft generated pop; an emote listed in `VOICE_CLIPS` (`apps/web/components/chat/chat-dock.tsx`) plays `public/sounds/voice/<id>.webm` instead.

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
| `lol` | "LOL" | no |

Voice lines: record your own short clips (or friends'), ≤ 1.5 s, Opus in WebM + AAC fallback, ≤ 15 KB each, lazy-loaded after the game screen is interactive. Respect the user's sound setting and device mute.

Note: `last_card` emote is cosmetic. The real Whot "Last card" declaration is a **game action** (see `games/whot.md`).

## Text chat

- 200 chars max, 1 message per 2 s, newline/zero-width chars stripped, NFC-normalized.
- Filter with `obscenity` (`englishDataset` + `englishRecommendedTransformers`) **plus** a custom Naija list in `packages/protocol/src/moderation.ts` (`CHAT_NAIJA`; imported as `@gamehub/protocol/moderation`, never from the package root, so browsers never load it).
- Filtered words are censored (`****`), not blocked. 5 censored messages in 2 minutes → auto chat-mute 5 min for that room.
- Links blocked (`http`, `www.`, `.com` patterns) → message rejected with "Links aren't allowed."
- Phone numbers (≥ 10 digits) masked — protects users from sharing contacts with strangers.
- Chat is **not stored** anywhere. Each message is HMAC-signed by the DO (`sig = HMAC(CHAT_SIGN_SECRET, roomId|userId|ts|text)`) so a report can prove what was said without us keeping logs.
- Client keeps the last 50 messages in memory per room (`apps/web/lib/chat/store.ts`).
- Quick-match spectators get no chat. Rate limits and the 5-minute auto mute live in DO memory (hibernation forgives a little).

As built (Oct 2026): a round chat button at the bottom right (above the lobby's Start bar and result sheets) with an unread dot; a sheet with the messages, emote chips and a text box; new lines and emotes pop as bubbles at the top for 3 s. Server messages: `chat`, `emote`, `chat_state {mutedUntil, off}`, `chat_error {LINK|MUTED|OFF|SLOW|REPORTED|BAD_REPORT}` (docs/03).

### Controls for players
- Tap a name in chat: Mute in this game (local) · Block (persistent, also removes friendship) · Report… (Insults or bullying, Hate, Sexual, Spam, Cheating, Something else; the tapped line goes in as evidence). Turn off chat for myself: Settings → Game preferences → "Chat in public games" (`user.public_chat`). The host can turn room chat off in the lobby.
- Blocked users' chat and emotes are hidden client-side and the server stops delivering their chat to the blocker (the DO receives block lists via ticket claims: `blocked: string[]`, capped 200).

## Reports

- Report sends the signed message (if any) + reason to the DO → the DO checks its own signature (a forged line goes in as `null`) and forwards to `web` `/api/internal/report` (HMAC, through the outbox) → `web` stores the report.
- Auto-actions: 3 open reports against the same user from 3 different users within 24 h → automatic chat-mute 24 h (`chatMutedUntil`), report stays open for review.
- Muted users: chat input disabled with "Chat is off for you until 6:42 PM". Emotes still allowed.

## Admin panel (`/admin`, role `admin`)

- Queue of open reports (newest first), each with: reporter, target, room, reason, verified message text, target's history (past reports/actions).
- Actions: dismiss, warn (a notice on Home until "Got it"; `user.notice`), chat-mute (1 h / 24 h / 7 d), unmute, ban (1 d / 7 d / permanent), unban. A lookup by @username for people with no open report.
- Making someone an admin is SQL only: `update "user" set role = 'admin' where username = '…';`
- Ban → `bannedUntil` set, their open reports closed → Worker `POST /moderation/kick` → Presence closes their sockets and asks the room they're in to do the same, all with **4010** → the client goes to `/banned`; the ticket route reads the ban fresh from the database and answers 403 (the client goes to `/banned` again).
- All actions logged in `moderation_action`.
- Admin pages are dynamic, `noindex`, excluded from PWA cache.

## Public username rules

Profanity-checked on creation and change; reserved names (`admin`, `gamehub`, `moderator`, `support`, `bot`, `system`…) blocked.
