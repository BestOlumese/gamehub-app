import type { GameSlug } from "@gamehub/engine";
import { z } from "zod";

// protocol may only import types from engine, so the list is repeated here.
// The two checks below fail to compile if it drifts from engine's GameSlug.
const slugs = [
  "whot",
  "ludo",
  "snakes",
  "tictactoe",
  "rps",
  "chess",
  "draughts",
] as const satisfies readonly GameSlug[];
type Missing = Exclude<GameSlug, (typeof slugs)[number]>;
const _complete: [Missing] extends [never] ? true : Missing = true;

export const gameSlugSchema = z.enum(slugs);
