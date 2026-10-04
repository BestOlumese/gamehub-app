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
| `BETTER_AUTH_SECRET`, Google OAuth, `DATABASE_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, Turnstile secret | Vercel |

Rotate by supporting two values (`current`, `previous`) during rotation.

## Privacy (NDPA)

- Collect only: email, username, avatar (Google), adult-confirmation timestamp, gameplay records.
- Privacy policy + terms pages (plain English): what we store, why, how long, how to delete.
- Account deletion and data export (JSON of profile + match history) in settings.
- Hash emails in logs; no chat storage.
- This is not legal advice — see `concerns.md`.
