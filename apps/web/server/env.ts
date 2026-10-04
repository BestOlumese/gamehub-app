import "server-only";
import { z } from "zod";

// Cloudflare's documented Turnstile test keys: always pass, for dev and E2E.
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

const schema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GMAIL_USER: z.email().optional(),
  GMAIL_APP_PASSWORD: z.string().min(1).optional(),
  /** Dev/E2E only: send mail to a local SMTP sink such as Mailpit (smtp://localhost:1025). */
  SMTP_URL: z.url().optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).default(TURNSTILE_TEST_SECRET),
  /** Shared with the realtime Worker: signs 60 s WebSocket tickets. */
  REALTIME_TICKET_SECRET: z.string().min(32).optional(),
  /** Shared with the realtime Worker: signs web → Worker calls (POST /rooms). */
  INTERNAL_HMAC_SECRET: z.string().min(32).optional(),
  /** Worker base URL for server-side calls, e.g. https://gamehub-realtime.gamehub-app.workers.dev */
  REALTIME_URL: z.url().optional(),
  /** E2E only: every test browser shares one IP. Refused in production. */
  E2E_DISABLE_RATE_LIMIT: z.enum(["1"]).optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Validated on first use so `next build` doesn't need runtime secrets. */
export function env(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid server environment:\n${z.prettifyError(parsed.error)}`);
    }
    if (
      process.env.VERCEL_ENV === "production" &&
      parsed.data.TURNSTILE_SECRET_KEY === TURNSTILE_TEST_SECRET
    ) {
      throw new Error("TURNSTILE_SECRET_KEY must be set in production");
    }
    cached = parsed.data;
  }
  return cached;
}

/** Realtime settings, required once games are used. */
export function realtimeEnv() {
  const e = env();
  if (!e.REALTIME_TICKET_SECRET || !e.INTERNAL_HMAC_SECRET || !e.REALTIME_URL) {
    throw new Error("REALTIME_TICKET_SECRET, INTERNAL_HMAC_SECRET and REALTIME_URL must be set");
  }
  return {
    ticketSecret: e.REALTIME_TICKET_SECRET,
    hmacSecret: e.INTERNAL_HMAC_SECRET,
    url: e.REALTIME_URL,
  };
}
