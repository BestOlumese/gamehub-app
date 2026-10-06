# 00 — Overview

## What GameHub is

A fast, free, web-only place to play Nigeria's favourite table games with friends or strangers, in real time, on a phone browser over a shaky mobile connection — and have it just work.

**Tagline (working):** *Your games. Your people. No wahala.*

## Who it is for

- Adults (18+) in Nigeria, mostly on mid/low-end Android phones, on 4G with occasional drops.
- Friend groups who already play Whot and Ludo offline and want to play remotely.
- Students and young workers killing time — short sessions (3–15 min).

## Locked product decisions

| Topic | Decision |
|---|---|
| Money | Free to play. No monetization of any kind. |
| Hosting | Free tiers only, no credit card: Vercel Hobby, Cloudflare Workers Free, Neon Free, Gmail SMTP. Free subdomains (`*.vercel.app`, `*.workers.dev`). |
| Platform | Web only (installable PWA). No native apps. |
| Language | English only. |
| Age | 18+ only (date-of-birth gate at signup). |
| Games at launch | Whot (2–8), Ludo (2–4), Snakes & Ladders (2–8), Tic-tac-toe (2), Rock Paper Scissors (2–8). |
| Games after Snakes (in build order) | **Chess** (2; bullet/blitz/rapid clocks or no clock; ranked in quick-match) · **Draughts** (2; Naija 10×10 "draft" by default, English 8×8 option; ranked) · **Property-trading game** (2–8; our own name, board and cards; timed or classic; unranked) · **Football Draft** (1–8; draft real footballers, simulated matches; head-to-head, league, knockout, solo run; unranked). |
| Modes | Private rooms; public quick-match (later phase); **Tournament mode**: private lobby, 4–32 entrants, host-defined stages using any game, bots may fill slots, unranked, no prizes (`16-tournaments.md`). |
| Bots (strong) | Easy bots run in the room; Medium/Hard chess and Hard draughts run in a **bot service** on Vercel (Stockfish, server only) with a silent fallback (`15-bot-service.md`). |
| Licences & IP | No GPL/AGPL in the browser; no third-party trademarks, trade dress or likenesses; real footballer names and public facts only in Football Draft (`concerns.md`). |
| Rules | Every game has a "Naija Standard" preset; every rule is customizable per private room. |
| Finding players | Private rooms (code + WhatsApp link), bots fill empty/abandoned seats, public quick-match (pick game + player count). |
| Bots | Easy / Medium / Hard. Never cheat (no peeking at hidden info). |
| Ranked | Only public quick-match games with **all human** players are ranked. Private rooms and any game with a bot are unranked. |
| Turn timer | 30 s default, customizable per room (10–120 s). |
| Disconnect grace | 60 s seat hold, then a bot plays the seat until the player returns. |
| Accounts | Required. Email+password (must verify via emailed link) or Google. Full forgot/reset password. Nodemailer + Gmail SMTP. |
| Communication | Emotes + Naija voice lines everywhere; text chat in private rooms and public games, with profanity filter, report, mute, block, admin panel. |
| Social | Friends + invites + online status, ratings per game, weekly & all-time leaderboards, match history & stats, spectator mode. |
| Look | Light theme, clean, confident brand colour, not flashy, not bland. |
| Monitoring | None. |
| Testing | Engine unit + property tests; E2E for key flows. |

## Non-goals (v1)

- Native apps, offline multiplayer, voice/video calls, tournaments with prizes (tournament mode exists but awards nothing), clans, cosmetics/shop, multiple languages, 6-player Ludo, Ludo/Whot variants beyond configurable rules.
- Chess variants (960, crazyhouse…), UltraBullet, correspondence chess, engine analysis for players.
- Draughts variants beyond Naija 10×10 and English 8×8 (Russian, Brazilian, Turkish…).
- Football: live (in-match) control, player photos/badges/kits, trading players between managers, any rewards or unlocks, injuries (v1).
- Public (matchmade) tournaments; ranked tournaments.

## Success criteria for v1

- Lighthouse (mobile) ≥ 95 Performance, 100 Accessibility, 100 Best Practices, 100 SEO on `/`, `/games`, `/games/[slug]`.
- A move round-trip (tap → confirmed on other players' screens) feels instant: optimistic feedback < 50 ms locally; server-confirmed < 300 ms p75 from Lagos.
- A player who loses network for up to 60 s rejoins the same seat with the full correct state, without a page reload.
- No game ever freezes because one player left.
- Stays inside free-tier limits for the first months (see `13-free-tier-budget.md`).

## Glossary

| Term | Meaning |
|---|---|
| Room | One game session (a Durable Object instance). |
| Seat | A position in a room, held by a human or a bot. |
| View | The per-seat projection of game state (hides others' private info). |
| Intent / action | What a client asks to do (`play_card`, `roll`, `move_seed`). |
| Ticket | Short-lived signed token that proves who is opening a WebSocket. |
| Market | Whot draw pile. |
| Call card | Whot top card of the discard pile. |
| Seed | A Ludo token; also a draughts piece in Nigerian usage ("seeds"). |
| Draft | The Nigerian name for 10×10 draughts — and, in Football Draft, picking players 1 of 5. |
| Bot service | Vercel function running Stockfish / our draughts searcher for strong bots. |
| Stage | One game step of a tournament (game, rules, table size, how many advance). |
| Manager | A player in a Football Draft room. |
