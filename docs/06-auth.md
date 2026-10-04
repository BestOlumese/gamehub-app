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
// apps/web/src/server/auth.ts
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
// apps/web/src/server/email.ts
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
