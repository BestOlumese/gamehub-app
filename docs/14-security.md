# 14 — Security & fair play

## Threats and controls

| Threat | Control |
|---|---|
| Seeing other players' Whot hands | Per-seat `view()`; never broadcast shared state for hidden-info games; property test for leaks. |
| Predicting dice/shuffles | Server-side seeded RNG; seed from `crypto.getRandomValues`; seed never sent to clients (only revealed in admin tools after the game, if ever). |
| Forged moves | Server validates every action with the engine; client state is ignored. |
| Acting for another player | Seat bound to ticket `sub`; one socket per user per room. |
| Stolen/replayed tickets | 60 s expiry, scope-bound, `Origin` check, HTTPS only; tickets never logged. |
| Spoofed internal calls (DO → web) | HMAC-SHA256 over `ts.body`, 5 min window, idempotent inserts. |
| Message floods | Per-socket token buckets (see `03-realtime-protocol.md`); 4 KB max frame; close 4029. |
| Bot sign-ups | Turnstile on sign-up and forgot-password; Better Auth rate limiting; mandatory email verification. |
| Rating farming / collusion | Ranked only via quick-match; pair cap (5 ranked games/24 h); collusion in Whot (two friends teaming) is accepted risk — friends can't choose the same quick-match room. |
| Multi-accounting | Email verification + Turnstile; accepted residual risk. |
| Abuse in chat | Filter, signed messages, reports, mutes, bans (see `09-chat-moderation.md`). |
| XSS | React escaping; chat rendered as text only; no `dangerouslySetInnerHTML`; strict CSP. |
| CSRF | Better Auth handles auth routes; server actions use Next.js built-in origin checks. |
| Data exposure | `realtime` has no DB access; Neon credentials only in Vercel env; least-privilege DB role for the app. |
| **Seeing Football Draft option sets or rivals' picks** | Option sets are hidden information: generated server-side from the seeded RNG, placed only in the picking manager's view and only while that pick is active; others see `{ pick, ready }`; both teams revealed at kickoff. Property test: no view contains another manager's player ids before kickoff. |
| **Predicting the property card decks** | Deck order lives only in server state (`decks`), never in any view (`decksLeft` counts only); RNG seed never leaves the server. |
| **Forging bot-service calls / burning the Vercel CPU quota** | Separate `BOT_HMAC_SECRET`, ±5 min window, 4 KB bodies, CORS closed, queue limit (`BUSY`), `Quota` DO daily budget + per-instance hourly backstop (`15-bot-service.md`). |
| **Clock tampering (chess/draughts)** | Clocks run on server time; the client only reports its own think time `mt`, which can reduce charged time by at most the lag quota (lichess model); flags are decided by the server alarm; `flag` is a server-only action. |
| **Engine assistance in ranked chess** | Accepted residual risk for v1 (no cheat detection); reports + admin bans; ranked only via quick-match with the pair cap. |
| **Trade "gifting" (property) in tournaments / to bots** | Tournament rooms refuse trades where one side's value is < 25 % of the other's; bots never accept negative-value trades by their valuation; trades are logged in the match record for review. |
| **Collusion in tournament tables** | Accepted residual risk (private mode, unranked, no prizes); host can kick in the lobby. |
| **Draft auto-pick abuse** (dropping on purpose) | Auto-pick takes the best-fit option, so dropping gives no advantage. |
| **Spoilers in football playback** | A half's events are sent at its start; a modified client could read ahead within that half only — accepted (no live decisions during a half). |
| Secrets in client | Only `NEXT_PUBLIC_REALTIME_HOST` and Turnstile site key are public. |

## Headers (web)

- CSP: `default-src 'self'; connect-src 'self' wss://gamehub-realtime.gamehub-app.workers.dev https://challenges.cloudflare.com; script-src 'self' 'nonce-…' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com https://accounts.google.com; img-src 'self' data: https://lh3.googleusercontent.com; style-src 'self' 'unsafe-inline'`.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (no camera/mic/geolocation).

## Secrets

| Secret | Where |
|---|---|
| `REALTIME_TICKET_SECRET` | Vercel + Wrangler |
| `INTERNAL_HMAC_SECRET` | Vercel + Wrangler |
| `CHAT_SIGN_SECRET` | Wrangler (+ Vercel for verifying reports) |
| `BOT_HMAC_SECRET` | Wrangler + Vercel (bot service only) |
| `BETTER_AUTH_SECRET`, Google OAuth, `DATABASE_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, Turnstile secret | Vercel |

Rotate by supporting two values (`current`, `previous`) during rotation.

## Privacy (NDPA)

- Collect only: email, username, avatar (Google), adult-confirmation timestamp, gameplay records.
- Privacy policy + terms pages (plain English): what we store, why, how long, how to delete.
- Account deletion and data export (JSON of profile + match history) in settings.
- Hash emails in logs; no chat storage.
- This is not legal advice — see `concerns.md`.
