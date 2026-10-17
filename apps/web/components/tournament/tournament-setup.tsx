"use client";

import type { BotLevel, TournamentConfig } from "@gamehub/protocol";
import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { Field } from "@gamehub/ui/forms/field";
import { Input } from "@gamehub/ui/forms/input";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { ChevronRight, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Toggle } from "@/components/create-room/rule-controls";
import {
  capacityPercent,
  defaultStage,
  isKnockout,
  normalise,
  STAGE_GAMES,
  stageFlow,
  stageSummary,
  type StageSpec,
} from "@/lib/tournament/plan";
import { StageSheet } from "./stage-sheet";
import { Stepper } from "./stepper";

const LEVELS: ReadonlyArray<{ value: BotLevel; label: string }> = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

/** Above this share of the day's free capacity, the host is warned (docs/16-tournaments.md). */
const HEAVY_PERCENT = 15;

export type SetupResult = { message: string; problems?: string[] } | null;

/** The host's plan: name, players, bots, and the stages as numbered cards. */
export function TournamentSetup({
  initial,
  submitLabel,
  busyLabel,
  joined = 1,
  onSubmit,
}: {
  initial: TournamentConfig;
  submitLabel: string;
  busyLabel: string;
  /** People already in (an edit can't go below them). */
  joined?: number;
  onSubmit: (c: TournamentConfig) => Promise<SetupResult>;
}) {
  const [name, setName] = useState(initial.name);
  const [entrants, setEntrants] = useState(initial.entrants);
  const [fill, setFill] = useState(initial.botFill !== null);
  const [level, setLevel] = useState<BotLevel>(initial.botFill ?? "medium");
  const [autoStart, setAutoStart] = useState(initial.autoStart);
  const [spectators, setSpectators] = useState(initial.spectators);
  const [raw, setStages] = useState<StageSpec[]>(initial.stages as StageSpec[]);
  const [editing, setEditing] = useState<number | null>(null);
  const [result, setResult] = useState<SetupResult>(null);
  const [pending, start] = useTransition();

  const stages = normalise(entrants, raw);
  const { counts, errors } = stageFlow(entrants, stages);
  const percent = capacityPercent(entrants, stages);
  const nameOk = name.trim().length >= 3 && name.trim().length <= 40;
  const config: TournamentConfig = {
    name: name.trim(),
    entrants,
    botFill: fill ? level : null,
    stages,
    autoStart,
    spectators,
  };

  function addStage() {
    // The old final becomes a stage people go through, keeping its game and rules.
    const prev = stages.map((s, i) => {
      if (i !== stages.length - 1) return s;
      const d = defaultStage(s.game, counts[i] ?? 2, false);
      return { ...d, rules: s.rules, bestOf: s.bestOf };
    });
    const n = stageFlow(entrants, prev).counts[prev.length] ?? 2;
    // The new last stage: a final table if everyone fits at one, otherwise a knockout.
    const next = n <= 8 ? defaultStage("whot", n, true) : defaultStage("chess", n, true);
    setStages([...prev, next]);
  }

  return (
    <div className="space-y-6">
      <Field htmlFor="t-name" label="Name" error={nameOk ? undefined : "3 to 40 characters."}>
        <Input
          id="t-name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!nameOk || undefined}
        />
      </Field>

      <div className="space-y-4 rounded-card border border-line bg-surface p-4">
        <Stepper
          label="Players"
          hint="4 to 32, people and bots."
          value={entrants}
          min={Math.max(4, joined)}
          max={32}
          onChange={setEntrants}
        />
        <Toggle
          label="Bots fill empty places"
          hint="At the start, so you never wait for one missing person. Bots can win."
          checked={fill}
          onChange={setFill}
        />
        {fill ? (
          <Segmented label="Bot level" value={level} onChange={setLevel} options={LEVELS} />
        ) : null}
      </div>

      <section aria-labelledby="stages-h" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="stages-h" className="font-bold">
            Stages
          </h2>
          <p
            className="font-display font-bold tabular-nums text-brand"
            aria-label="Players after each stage"
          >
            {counts.join(" → ")}
          </p>
        </div>
        <ol className="divide-y divide-line rounded-card border border-line bg-surface">
          {stages.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => setEditing(i)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-bold text-brand-strong">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{STAGE_GAMES[s.game].name}</span>
                  <span className="block text-sm text-ink-2">
                    {stageSummary(s, counts[i] ?? 0, i === stages.length - 1)}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="text-ink-3" />
              </button>
            </li>
          ))}
        </ol>
        {stages.length < 6 && (counts.at(-1) ?? 1) >= 1 ? (
          <Button variant="secondary" block onClick={addStage}>
            <Plus size={18} aria-hidden="true" /> Add stage
          </Button>
        ) : null}
        {errors.length ? (
          <Alert title="The plan doesn't work yet">
            <ul className="list-disc pl-5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          <p className={`px-1 text-sm ${percent > HEAVY_PERCENT ? "text-danger" : "text-ink-2"}`}>
            {percent > HEAVY_PERCENT
              ? `This is a heavy tournament (about ${percent}% of GameHub's free daily capacity). It may not finish if GameHub gets busy. Fewer Ludo stages help.`
              : `Uses about ${percent}% of GameHub's free daily capacity.`}
          </p>
        )}
      </section>

      <div className="divide-y divide-line rounded-card border border-line bg-surface">
        <Toggle
          label="Start by itself when full"
          hint="Otherwise you press Start."
          checked={autoStart}
          onChange={setAutoStart}
        />
        <Toggle
          label="Others can watch"
          hint="People outside the tournament can watch tables. Knocked-out players always can."
          checked={spectators}
          onChange={setSpectators}
        />
      </div>

      {result ? (
        <Alert title={result.message}>
          {result.problems?.length ? (
            <ul className="list-disc pl-5">
              {result.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <Button
        block
        disabled={pending || !nameOk || errors.length > 0}
        onClick={() =>
          start(async () => {
            setResult(await onSubmit(config));
          })
        }
      >
        {pending ? <Spinner /> : null}
        {pending ? busyLabel : submitLabel}
      </Button>

      {editing !== null && stages[editing] ? (
        <StageSheet
          key={editing}
          open
          index={editing}
          stage={stages[editing] as StageSpec}
          players={counts[editing] ?? 2}
          last={editing === stages.length - 1}
          canRemove={stages.length > 1}
          onClose={() => setEditing(null)}
          onSave={(s) => {
            setStages(stages.map((x, i) => (i === editing ? s : x)));
            setEditing(null);
          }}
          onRemove={() => {
            const rest = stages.filter((_, i) => i !== editing);
            // The new last stage ends at a winner.
            setStages(
              rest.map((x, i) =>
                i === rest.length - 1 && isKnockout(x) ? { ...x, advance: 1 } : x,
              ),
            );
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
