// Half-time team talk (decided with Best, Oct 2026): four talks, a reaction that depends on the
// score and on how the half really went (xG), and a short effect on the next 15 minutes. The
// reaction is told only to that manager.

export type Talk = "fire" | "calm" | "praise" | "demand";
export const TALKS: readonly Talk[] = ["fire", "calm", "praise", "demand"];
export type Reaction = "good" | "neutral" | "bad";

/** Rating points for the 15 minutes after the break. */
export const TALK_BOOST: Record<Reaction, number> = { good: 2, neutral: 0, bad: -1.5 };
/** How long a talk lasts, in match minutes. */
export const TALK_MINUTES = 15;

/**
 * How the squad takes it. `diff`: your goals minus theirs; `xgDiff`: your xG minus theirs so far
 * (positive: you've played better than the score may say).
 */
export function talkReaction(talk: Talk, diff: number, xgDiff: number): Reaction {
  const better = xgDiff > 0.3; // played well
  const worse = xgDiff < -0.3; // played badly
  if (diff >= 2)
    return talk === "praise" || talk === "calm" ? "good" : talk === "demand" ? "bad" : "neutral";
  if (diff === 1)
    return talk === "calm"
      ? "good"
      : talk === "fire"
        ? worse
          ? "good"
          : "neutral"
        : talk === "praise"
          ? worse
            ? "bad"
            : "good"
          : worse
            ? "good"
            : "neutral";
  if (diff === 0)
    return talk === "fire"
      ? "good"
      : talk === "demand"
        ? worse
          ? "good"
          : "bad"
        : talk === "praise"
          ? better
            ? "good"
            : "neutral"
          : "neutral";
  if (diff === -1)
    return talk === "fire"
      ? "good"
      : talk === "demand"
        ? worse
          ? "good"
          : "bad"
        : talk === "praise"
          ? better
            ? "good"
            : "bad"
          : "neutral";
  // Two or more down.
  return talk === "demand" || talk === "fire" ? "good" : talk === "praise" ? "bad" : "neutral";
}

/** The line the manager sees after the talk. */
export function reactionLine(talk: Talk, r: Reaction): string {
  if (r === "neutral") return "They take it in. No big reaction.";
  const lines: Record<Talk, [string, string]> = {
    fire: ["They're buzzing. Fired up for this half.", "Some of them look rattled."],
    calm: ["They look settled and focused.", "They look a bit too relaxed."],
    praise: ["They lap it up. Confident.", "They look complacent."],
    demand: ["They know they owe you more.", "Some think that's unfair. Heads dropped."],
  };
  return lines[talk][r === "good" ? 0 : 1];
}
