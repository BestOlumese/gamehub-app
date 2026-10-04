import { createAuthClient } from "better-auth/client";

/** Browser-side Better Auth client. Same-origin, so no baseURL needed. */
export const authClient = createAuthClient();

export type AuthError = { code?: string | undefined; message?: string | undefined; status: number };

const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match.",
  EMAIL_NOT_VERIFIED: "Please verify your email first. We've sent you a new link.",
  USER_ALREADY_EXISTS: "There's already an account with that email.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters.",
  PASSWORD_TOO_LONG: "That password is too long.",
  INVALID_PASSWORD: "That password isn't right.",
  INVALID_TOKEN: "That link has expired or was already used.",
  VERIFICATION_FAILED: "The human check failed. Please try again.",
  MISSING_RESPONSE: "Please complete the human check.",
  SESSION_EXPIRED: "For your safety, please log in again first.",
  SESSION_NOT_FRESH: "For your safety, please log in again first.",
  TOKEN_EXPIRED: "That link has expired. Ask for a new one.",
  EMAIL_CAN_NOT_BE_UPDATED: "That email can't be used.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There's already an account with that email.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "This account signs in with Google.",
};

/** Plain-English message for a Better Auth error. Our own hooks already send friendly text. */
export function authErrorMessage(error: AuthError | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 429 && !error.code?.startsWith("RESEND")) {
    return "Too many tries. Wait a minute and try again.";
  }
  const known = error.code ? messages[error.code] : undefined;
  if (known) return known;
  if (error.message && error.status < 500) return error.message;
  return "Something went wrong on our side. Please try again.";
}
