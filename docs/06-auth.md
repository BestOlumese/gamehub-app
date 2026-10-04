# 06 — Auth & email

Better Auth in `apps/web`, Drizzle adapter on Neon.

## Requirements

- Account required to play (no guests).
- Sign-up: email + password **or** Google.
- Email+password accounts **must verify via emailed link** before they can sign in.
- Full flows: sign up, verify, resend verification, sign in, sign out, forgot password, reset password, change password, change email (verify new address), delete account.
- 18+ gate at sign-up (both methods).
- Unique username picked after first sign-in (onboarding step), 3–20 chars `[a-z0-9_]`, profanity-checked.
- Turnstile on sign-up and forgot-password forms.

## Better Auth config

```ts
// apps/web/server/auth.ts (abridged; the real file is the source of truth)
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { after } from "next/server";
import { db } from "@gamehub/db";
import { sendEmail } from "./email";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      after(() => sendEmail("reset", user.email, { url }));     // don't await → no timing leak
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,                 // unverified sign-in attempt re-sends the link
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      after(() => sendEmail("verify", user.email, { url }));
    },
  },
  socialProviders: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
  user: {
    additionalFields: {
      username: { type: "string", required: false, unique: true },
      adultConfirmedAt: { type: "date", required: false },
      role: { type: "string", defaultValue: "player", input: false },
      bannedUntil: { type: "date", required: false, input: false },
    },
  },
});
```

Check option names against the installed Better Auth version (1.7.x at time of writing). Better Auth's docs advise not awaiting email sends (timing attacks) and using `waitUntil`-style helpers on serverless — `after()` is Next.js's equivalent.

## 18+ gate

- Sign-up form: date of birth field (day / month / year selects, not a date picker — faster on Android).
- Server checks age ≥ 18 → sets `adultConfirmedAt = now()`. **The DOB itself is never stored.**
- Google sign-up: after OAuth returns, if `adultConfirmedAt` is null → onboarding page asks DOB before anything else. Middleware blocks every route except `/onboarding`, `/legal/*`, `/api/auth/*` until confirmed.
- Under 18 → "GameHub is for adults (18+)." Account is deleted immediately (no data kept).
- Terms state that users confirm they are 18+. This is a self-declaration; see `concerns.md`.

## Email (Nodemailer + Gmail SMTP)

```ts
// apps/web/server/email/send.ts (abridged)
import nodemailer from "nodemailer";
const transport = nodemailer.createTransport({
  host: "smtp.gmail.com", port: 465, secure: true,
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },  // 16-char App Password
  pool: false,                       // serverless: one connection per send
});

export async function sendEmail(kind: "verify" | "reset" | "email-change", to: string, data: { url: string }) {
  const today = await countEmailsLast24h();               // email_log table
  if (today >= 480) return logEmail(kind, to, "skipped_quota");   // hard stop before Gmail's 500
  const { subject, html, text } = templates[kind](data);
  try {
    await transport.sendMail({ from: `GameHub <${process.env.GMAIL_USER}>`, to, subject, html, text });
    await logEmail(kind, to, "sent");
  } catch (e) {
    await logEmail(kind, to, "failed");
  }
}
```

Setup steps (document in README):
1. Create a dedicated Gmail account for GameHub (don't use your personal one).
2. Turn on 2-Step Verification → create an App Password ("Mail").
3. Put `GMAIL_USER` and `GMAIL_APP_PASSWORD` in Vercel env vars.

### Limits & behaviour
- Gmail free: 500 recipients per rolling 24 h. Each verification/reset email = 1.
- `email_log` keeps the last 30 days (kind, hashed recipient, status, created_at) — count last 24 h before sending.
- Resend button: 60 s cooldown client + server, max 5 per address per day.
- If quota reached: UI says "We've hit today's email limit. Please try again in a few hours." Google sign-in remains available (no email needed) — show it prominently.

### Templates
Plain, branded, light. Subject lines:
- "Verify your GameHub email"
- "Reset your GameHub password"
Text version always included. Links expire: verify 24 h, reset 1 h (Better Auth defaults/config).

## Sessions

- Cookie sessions (Better Auth default), `SameSite=Lax`, `Secure`.
- Realtime uses separate 60 s tickets (see `03-realtime-protocol.md`) because the Worker lives on a different domain (`*.workers.dev`) and can't read Vercel cookies.

## Bans

- `bannedUntil` checked in middleware and in the ticket endpoint (banned users get no tickets → can't play).
- Admin bans also call Presence to close the user's sockets (4008).

## Account deletion (NDPA)

- Settings → Delete account → confirm password (or re-auth with Google).
- Hard-delete user, sessions, friends, reports *by* them; anonymize `match_player.user_id` → null with display name "Deleted player" so others' histories stay intact.

## Routes

| Route | Purpose |
|---|---|
| `/signup`, `/login`, `/verify-email` (pending + resend), `/forgot-password`, `/reset-password` | Auth pages (static shells, client forms) |
| `/onboarding` | DOB (Google users) + username |
| `/settings/account` | Change password/email, delete account |
| `/api/auth/[...all]` | Better Auth handler |
| `/api/realtime/ticket` | Issues WS tickets (requires verified, adult, not banned, username set) |

## As built (Phase 1)

How the requirements above are implemented. Code wins if this drifts.

| Concern | Where / how |
|---|---|
| 18+ at email sign-up | Client sends `dob` with `POST /sign-up/email`. A `hooks.before` middleware validates it (`lib/age.ts`, Lagos date) and throws `UNDER_18` before any row is written. `databaseHooks.user.create.before` sets `adultConfirmedAt` only for that path. The DOB is never stored. |
| 18+ for Google | `adultConfirmedAt` stays null → proxy sends the user to `/onboarding` → `confirmAge` server action. Under 18: sign out + delete the user row (sessions/accounts cascade). |
| Locked fields | `username`, `adultConfirmedAt`, `role`, `bannedUntil`, `chatMutedUntil` are `input: false`; Better Auth rejects them in sign-up/update bodies. Username is set only by the `saveUsername` server action. |
| Turnstile | Better Auth `captcha` plugin (`cloudflare-turnstile`) on `/sign-up/email` and `/request-password-reset`; token in `x-captcha-response`. Widget uses `appearance: "interaction-only"`. Cloudflare test keys are the default outside production; production refuses to boot with them. |
| Email quota | `hooks.before` refuses `/sign-up/email`, `/request-password-reset`, `/send-verification-email` with `EMAIL_QUOTA` once 480 sends in 24 h; the sign-up UI then highlights Google. `sendEmail` re-checks before sending. |
| Resend limits | `addressThrottle`: 60 s cooldown and 5 verify emails per address per 24 h (`RESEND_LIMIT`, 429). Sign-in-triggered resends obey the same throttle silently. |
| Enumeration | Taken email on sign-up returns a synthetic user shaped exactly like a real one (`customSyntheticUser`). Forgot-password always says "if an account exists". |
| Sessions | 30 days, refreshed daily, `cookieCache` 5 min. `proxy.ts` routes on the cookie cache (no DB hit); pages and server actions re-check through `server/session.ts` (`requireUser`, `requirePlayer`). After changing the user, call `getSession({ fresh: true })` inside the server action so the new cookie cache is written. |
| Rate limits | Better Auth limiter: 30/min default; sign-in 10, sign-up 5, reset 3, resend 3 per minute. `E2E_DISABLE_RATE_LIMIT=1` turns it off for Playwright only (all test browsers share one IP); refused when `VERCEL_ENV=production`. |
| Change email | `changeEmail.enabled`; the link goes to the **new** address (template "email-change"). |
| Delete account | Password users confirm with password; Google-only users need a sign-in from the last 10 minutes (`freshAge`). |
| Local dev | `pnpm services:up` (Postgres :5433, Mailpit :1025/:8025), `SMTP_URL=smtp://localhost:1025`. With no SMTP configured in dev, links are printed to the server log. |

### Gmail setup (production email)

1. Create a dedicated Gmail account for GameHub (not your personal one).
2. Google Account → Security → turn on 2-Step Verification.
3. Google Account → Security → App passwords → create one named "GameHub". Copy the 16 characters.
4. In Vercel → Settings → Environment Variables add `GMAIL_USER` (the address) and `GMAIL_APP_PASSWORD` (the 16 characters, no spaces).
