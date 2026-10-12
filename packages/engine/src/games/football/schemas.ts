import { z } from "zod";
import type { FootballRules } from "./rules";
import type { FootballAction } from "./state";
import { ROLES } from "./types";
import { FORMATIONS } from "./pitch";

// Server-side validation, kept apart so client bundles don't pull in zod.

export const footballRulesSchema: z.ZodType<FootballRules> = z.object({
  turnSeconds: z.number().int().min(10).max(60),
  mode: z.enum(["auto", "h2h_single", "h2h_bo3", "league", "knockout", "solo"]),
  draftLuck: z.enum(["balanced", "wild", "elite"]),
  chemistry: z.boolean(),
  formationsOffered: z.union([z.literal(3), z.literal(5)]),
  subs: z.union([z.literal(5), z.literal(7)]),
  arrangeSeconds: z.number().int().min(30).max(180),
  halfTimeSeconds: z.number().int().min(20).max(90),
  playbackSecondsPerHalf: z.number().int().min(20).max(600),
  // Rooms made before highlights existed (and older tabs) play every minute evenly.
  highlights: z.boolean().default(false),
  subsPerMatch: z.union([z.literal(3), z.literal(5)]),
  betweenMatchesSeconds: z.number().int().min(15).max(90),
});

const tactics = z.object({
  build: z.enum(["balanced", "short", "long", "counter"]),
  defence: z.enum(["balanced", "high_press", "mid_block", "deep_block"]),
  line: z.number().int().min(0).max(100),
  width: z.number().int().min(0).max(100),
  tempo: z.number().int().min(0).max(100),
  inBox: z.number().int().min(1).max(5),
});
const ref = z.union([
  z.object({ slot: z.number().int().min(0).max(10) }),
  z.object({ bench: z.number().int().min(0).max(6) }),
]);

/** What clients may send. "tick" is server-only, so it isn't here. */
export const footballActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pick"),
    choice: z.union([z.string().max(64), z.number().int().min(1).max(FORMATIONS.length)]),
    slot: z.number().int().min(0).max(10).optional(),
  }),
  z.object({ type: z.literal("swap"), a: ref, b: ref }),
  z.object({
    type: z.literal("role"),
    slot: z.number().int().min(0).max(10),
    role: z.enum(ROLES),
    focus: z.string().max(24).optional(),
  }),
  z.object({ type: z.literal("tactics"), tactics }),
  z.object({ type: z.literal("shout"), shout: z.enum(["attack", "hold", "press", "counter"]) }),
  z.object({ type: z.literal("formation"), id: z.number().int().min(1).max(FORMATIONS.length) }),
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("skip") }),
]) as unknown as z.ZodType<FootballAction>;
