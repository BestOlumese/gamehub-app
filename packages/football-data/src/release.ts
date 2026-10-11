// The released player data for the realtime Worker, parsed only when a football room first needs
// it (the Worker's cold start doesn't pay for it otherwise). `release.generated.ts` is written by
// `pnpm --filter football-data build --release` and checked against the batches by a test.
import { fromCompact, type CardPlayer, type Compact } from "./compact.ts";
import { RELEASE_JSON } from "./release.generated.ts";

let cached: { version: string; cards: CardPlayer[] } | null = null;

export function releaseCards(): { version: string; cards: CardPlayer[] } {
  if (!cached) {
    const c = JSON.parse(RELEASE_JSON) as Compact;
    cached = { version: c.v, cards: fromCompact(c) };
  }
  return cached;
}
