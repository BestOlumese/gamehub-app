import "server-only";
import { account, session, user, verification } from "@gamehub/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { captcha } from "better-auth/plugins";
import { after } from "next/server";
import { isAdult, todayInLagos } from "@/lib/age";
import { dobSchema } from "@/lib/dob";
import { siteUrl } from "@/lib/site";
import { getDb } from "./db";
import { addressThrottle, pruneEmailLog, quotaReached } from "./email/log";
import { sendEmail } from "./email/send";
import { env } from "./env";

export const UNDER_18_MESSAGE = "GameHub is for adults (18+).";
export const EMAIL_QUOTA_MESSAGE =
  "We've hit today's email limit. Please try again in a few hours, or continue with Google.";

const EMAIL_PATHS = new Set([
  "/sign-up/email",
  "/request-password-reset",
  "/send-verification-email",
]);

function createAuth() {
  const e = env();
  return betterAuth({
    appName: "GameHub",
    baseURL: siteUrl.origin,
    secret: e.BETTER_AUTH_SECRET,
    telemetry: { enabled: false },
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      // A sign-up with a taken email gets a fake success; make it match a real one.
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
        ...coreFields,
        ...additionalFields,
        adultConfirmedAt: coreFields.createdAt,
        id,
      }),
      sendResetPassword: async ({ user, url }) => {
        after(() => sendEmail("reset", user.email, url)); // not awaited: no timing leak
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }, request) => {
        // Change-email verification goes to the NEW address with its own wording.
        const kind =
          request && new URL(request.url).pathname.endsWith("/change-email")
            ? "email-change"
            : "verify";
        after(() => sendEmail(kind, user.email, url));
      },
    },
    socialProviders:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: e.GOOGLE_CLIENT_ID,
              clientSecret: e.GOOGLE_CLIENT_SECRET,
              prompt: "select_account",
            },
          }
        : {},
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 10, // deleting an account needs a sign-in from the last 10 minutes
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: {
      additionalFields: {
        username: { type: "string", required: false, input: false },
        adultConfirmedAt: { type: "date", required: false, input: false },
        role: { type: "string", required: false, defaultValue: "player", input: false },
        bannedUntil: { type: "date", required: false, input: false },
        chatMutedUntil: { type: "date", required: false, input: false },
        soundOn: { type: "boolean", required: false, defaultValue: true },
        reducedMotion: { type: "boolean", required: false, defaultValue: false },
      },
      changeEmail: { enabled: true },
      deleteUser: { enabled: true },
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    rateLimit: {
      enabled: !e.E2E_DISABLE_RATE_LIMIT,
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (EMAIL_PATHS.has(ctx.path) && (await quotaReached())) {
          throw new APIError("SERVICE_UNAVAILABLE", {
            message: EMAIL_QUOTA_MESSAGE,
            code: "EMAIL_QUOTA",
          });
        }
        if (ctx.path === "/sign-up/email") {
          const dob = dobSchema.safeParse((ctx.body as { dob?: unknown } | undefined)?.dob);
          if (!dob.success) {
            throw new APIError("BAD_REQUEST", {
              message: "Enter your date of birth.",
              code: "DOB_REQUIRED",
            });
          }
          if (!isAdult(dob.data, todayInLagos(new Date()))) {
            throw new APIError("FORBIDDEN", { message: UNDER_18_MESSAGE, code: "UNDER_18" });
          }
          after(() => pruneEmailLog().catch(() => {}));
        }
        if (ctx.path === "/send-verification-email") {
          const email = (ctx.body as { email?: unknown } | undefined)?.email;
          if (typeof email === "string") {
            const wait = await addressThrottle("verify", email);
            if (wait) {
              throw new APIError("TOO_MANY_REQUESTS", {
                message:
                  wait === "cooldown"
                    ? "Give it a minute before asking for another email."
                    : "That's the most emails we can send to this address today. Try again tomorrow.",
                code: "RESEND_LIMIT",
              });
            }
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Only email sign-ups pass the DOB check above; Google users confirm in onboarding.
          before: async (data, ctx) =>
            ctx?.path === "/sign-up/email"
              ? { data: { ...data, adultConfirmedAt: new Date() } }
              : undefined,
        },
      },
    },
    plugins: [
      captcha({
        provider: "cloudflare-turnstile",
        secretKey: e.TURNSTILE_SECRET_KEY,
        endpoints: ["/sign-up/email", "/request-password-reset"],
      }),
      nextCookies(), // must be last
    ],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  instance ??= createAuth();
  return instance;
}

export type Session = ReturnType<typeof getAuth>["$Infer"]["Session"];
