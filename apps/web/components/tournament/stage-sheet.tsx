"use client";

import type { GameSlug } from "@gamehub/engine";
import { Button } from "@gamehub/ui/forms/button";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { describeRules } from "@/lib/game-meta";
import {
  defaultStage,
  isKnockout,
  nextPow2,
  PRESETS,
  STAGE_GAMES,
  STAGE_ORDER,
  type StageSpec,
} from "@/lib/tournament/plan";
import { StageRules } from "./stage-rules";
import { Stepper } from "./stepper";

const BEST_OF = [
  { value: 1, label: "1 game" },
  { value: 3, label: "Best of 3" },
  { value: 5, label: "Best of 5" },
] as const;

/** One stage, edited in a sheet: game, table size, who goes through, rules. */
export function StageSheet({
  open,
  index,
  stage,
  players,
  last,
  canRemove,
  onClose,
  onSave,
  onRemove,
}: {
  open: boolean;
  index: number;
  stage: StageSpec;
  /** Players left when this stage starts. */
  players: number;
  last: boolean;
  canRemove: boolean;
  onClose: () => void;
  onSave: (s: StageSpec) => void;
  onRemove: () => void;
}) {
  const [s, setS] = useState(stage);
  const [rulesOpen, setRulesOpen] = useState(false);
  const g = STAGE_GAMES[s.game];
  const n = Math.max(2, players);
  const knockout = isKnockout(s);
  const targets: number[] = [];
  for (let t = 2; t <= nextPow2(n) / 2 && t < n; t *= 2) targets.push(t);

  const pickGame = (game: GameSlug) => {
    if (game === s.game) return;
    setS(defaultStage(game, n, last));
    setRulesOpen(false);
  };
  const setSize = (tableSize: number) =>
    setS((x) => ({
      ...x,
      tableSize,
      advance:
        tableSize === 2
          ? last
            ? 1
            : (targets.at(-1) ?? 2)
          : Math.min(Math.max(1, x.advance), tableSize - 1),
    }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Stage ${index + 1}`}
      description={`${n} players start this stage`}
    >
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Game</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {STAGE_ORDER.map((game) => {
              const info = STAGE_GAMES[game];
              const on = s.game === game;
              return (
                <button
                  key={game}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickGame(game)}
                  className={`min-h-14 rounded-control border-2 px-2 py-1.5 text-left text-sm leading-tight font-semibold transition-colors duration-(--dur-press) ${on ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface hover:border-ink-3"}`}
                >
                  {info.name}
                  <span className="block text-xs font-normal text-ink-2">
                    {info.max === 2 ? "1v1" : `${info.min}–${info.max}`}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {g.max > 2 && last ? (
          <Segmented
            label="The final"
            value={knockout ? "knockout" : "table"}
            onChange={(v) => setSize(v === "knockout" ? 2 : Math.min(g.max, n))}
            options={[
              { value: "table", label: "One table" },
              { value: "knockout", label: "1v1 knockout" },
            ]}
          />
        ) : g.max > 2 ? (
          <Stepper
            label="Players per table"
            hint="2 makes it one-on-one knockout matches."
            value={s.tableSize}
            min={2}
            max={Math.min(g.max, n)}
            onChange={setSize}
          />
        ) : null}

        {knockout ? (
          <div className="space-y-4">
            {last ? (
              <p className="rounded-control bg-surface-2 px-4 py-3 text-sm text-ink-2">
                One-on-one knockout down to the winner. With an odd number, some players get a bye
                (straight through), fewest byes first.
              </p>
            ) : targets.length ? (
              <Segmented
                label="Players left after this stage"
                value={s.advance}
                onChange={(advance) => setS((x) => ({ ...x, advance }))}
                options={targets.map((t) => ({ value: t, label: String(t) }))}
              />
            ) : (
              <p className="text-sm text-danger">
                Too few players for a knockout here. Make this the last stage.
              </p>
            )}
            <Segmented
              label="Each match"
              value={s.bestOf}
              onChange={(bestOf) => setS((x) => ({ ...x, bestOf }))}
              options={BEST_OF}
            />
            {s.game === "chess" || s.game === "draughts" || s.game === "tictactoe" ? (
              <p className="px-1 text-sm text-ink-2">
                Still level at the end: one decider with colours swapped
                {s.game === "chess" ? " (at 3+2)" : ""}, then a coin toss.
              </p>
            ) : null}
          </div>
        ) : last ? (
          <p className="rounded-control bg-surface-2 px-4 py-3 text-sm text-ink-2">
            {n <= g.max
              ? `The final: everyone left (${n}) at one ${g.name} table. The winner takes it.`
              : `${n} players is too many for one ${g.name} table (up to ${g.max}). Add a stage before this one, or use a knockout.`}
          </p>
        ) : (
          <Stepper
            label="Go through from each table"
            hint="Smaller tables send fewer, in proportion."
            value={Math.min(s.advance, s.tableSize - 1)}
            min={1}
            max={Math.max(1, s.tableSize - 1)}
            onChange={(advance) => setS((x) => ({ ...x, advance }))}
          />
        )}

        <div className="rounded-card border border-line">
          <button
            type="button"
            aria-expanded={rulesOpen}
            onClick={() => setRulesOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="block font-semibold">Rules</span>
              <span className="block truncate text-sm text-ink-2">
                {describeRules(s.game, s.rules ?? PRESETS[s.game])}
              </span>
            </span>
            <ChevronDown
              size={18}
              aria-hidden="true"
              className={`shrink-0 transition-transform ${rulesOpen ? "rotate-180" : ""}`}
            />
          </button>
          {rulesOpen ? (
            <div className="border-t border-line p-4">
              <StageRules
                game={s.game}
                rules={s.rules ?? PRESETS[s.game]}
                players={s.tableSize}
                onChange={(rules) => setS((x) => ({ ...x, rules }))}
              />
            </div>
          ) : null}
        </div>

        <div className="flex gap-3">
          {canRemove ? (
            <Button variant="secondary" onClick={onRemove}>
              Remove
            </Button>
          ) : null}
          <Button
            className="flex-1"
            onClick={() =>
              onSave(last && !knockout ? { ...s, tableSize: Math.min(n, g.max), advance: 1 } : s)
            }
          >
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
