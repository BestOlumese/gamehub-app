"use client";

import type { GameSlug } from "@gamehub/engine";
import { TIME_PRESETS, timeLabel } from "@gamehub/engine/chess";
import { chessCategory, QUICK_GAMES } from "@gamehub/engine/matchmaking";
import { Button } from "@gamehub/ui/forms/button";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GAME_NAMES } from "@/lib/game-meta";

const CATEGORY = { bullet: "Bullet", blitz: "Blitz", rapid: "Rapid" } as const;

/** "Quick match" under a game: pick players (chess: the clock; draughts: the variant), then find. */
export function QuickMatchButton({ game }: { game: GameSlug }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const q = QUICK_GAMES[game];
  const [players, setPlayers] = useState(q.sizes.includes(4) ? 4 : (q.sizes[0] ?? 2));
  const [tc, setTc] = useState("180+2");
  const [variant, setVariant] = useState<"naija10" | "english8">("naija10");
  const preset = TIME_PRESETS.find((p) => `${p.baseSeconds}+${p.incrementSeconds}` === tc);

  function find() {
    const params = new URLSearchParams({ g: game, n: String(players) });
    if (game === "chess") params.set("tc", tc);
    if (game === "draughts") params.set("v", variant);
    setOpen(false);
    router.push(`/play/quick?${params}`);
  }

  return (
    <>
      <Button variant="secondary" size="md" block onClick={() => setOpen(true)}>
        Quick match
      </Button>
      {open ? (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={`Quick match · ${GAME_NAMES[game]}`}
          description="Play people you don't know, now."
        >
          <div className="space-y-5">
            {q.sizes.length > 1 ? (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Players</legend>
                <div
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${q.sizes.length}, minmax(0, 1fr))` }}
                >
                  {q.sizes.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={players === n}
                      onClick={() => setPlayers(n)}
                      className={`h-12 rounded-control border-2 font-display text-lg font-bold transition-colors duration-(--dur-press) ${players === n ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface hover:border-ink-3"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {game === "chess" ? (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Clock</legend>
                <div className="grid grid-cols-3 gap-1.5">
                  {TIME_PRESETS.map((p) => {
                    const key = `${p.baseSeconds}+${p.incrementSeconds}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={tc === key}
                        onClick={() => setTc(key)}
                        className={`rounded-control border-2 px-2 py-2 text-center transition-colors duration-(--dur-press) ${tc === key ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface hover:border-ink-3"}`}
                      >
                        <span className="block font-display font-bold">{timeLabel(p)}</span>
                        <span className="block text-xs text-ink-2">
                          {CATEGORY[chessCategory(p)]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            {game === "draughts" ? (
              <Segmented
                label="Board"
                value={variant}
                onChange={setVariant}
                options={[
                  { value: "naija10", label: "Naija (10×10)" },
                  { value: "english8", label: "English (8×8)" },
                ]}
              />
            ) : null}
            <p className="rounded-control bg-surface-2 px-4 py-3 text-sm text-ink-2">
              {q.ranked
                ? `Naija Standard rules${game === "chess" && preset ? `, ${timeLabel(preset)} clock` : game === "draughts" ? ", 5+3 clock" : ", 30 s turns"}. Ranked when everyone is a person; if nobody comes in 20 s, bots fill in and it isn't ranked.`
                : "Naija Standard rules. Not ranked. If nobody comes in 20 s, bots fill in."}
            </p>
            <Button block onClick={find}>
              Find players
            </Button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
