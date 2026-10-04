/** Shared by the onboarding form (instant feedback) and the server (authoritative). */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const PATTERN = /^[a-z0-9_]+$/;

export type UsernameProblem = "too_short" | "too_long" | "bad_chars" | "edge_underscore";

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();

export function usernameFormatProblem(name: string): UsernameProblem | null {
  if (name.length < USERNAME_MIN) return "too_short";
  if (name.length > USERNAME_MAX) return "too_long";
  if (!PATTERN.test(name)) return "bad_chars";
  if (name.startsWith("_") || name.endsWith("_")) return "edge_underscore";
  return null;
}

export const usernameMessages: Record<UsernameProblem | "taken" | "not_allowed", string> = {
  too_short: `At least ${USERNAME_MIN} characters.`,
  too_long: `${USERNAME_MAX} characters at most.`,
  bad_chars: "Use only lowercase letters, numbers and _.",
  edge_underscore: "Can't start or end with _.",
  taken: "Someone already has that one.",
  not_allowed: "That name isn't allowed. Try another.",
};
