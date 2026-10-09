"use client";

import {
  chessNaija,
  speedOf,
  TIME_PRESETS,
  timeLabel,
  type ChessRules,
  type TimeControl,
} from "@gamehub/engine/chess";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { PresetStrip, Section, Toggle } from "./rule-controls";

type Props = { rules: ChessRules; onChange: (r: ChessRules) => void };

const GROUPS = [
  { speed: "bullet", label: "Bullet" },
  { speed: "blitz", label: "Blitz" },
  { speed: "rapid", label: "Rapid" },
] as const;

const same = (a: TimeControl, b: TimeControl) =>
  a === b ||
  (!!a && !!b && a.baseSeconds === b.baseSeconds && a.incrementSeconds === b.incrementSeconds);

/** Time control tiles (grouped like lichess), then the other rules. Starts on Naija Standard. */
export function ChessRulesStep({ rules, onChange }: Props) {
  const standard = JSON.stringify(rules) === JSON.stringify(chessNaija);
  const set = <K extends keyof ChessRules>(k: K, v: ChessRules[K]) =>
    onChange({ ...rules, [k]: v });
  const tile = (tc: TimeControl, label: string, wide = false) => (
    <button
      key={label}
      type="button"
      aria-pressed={same(rules.timeControl, tc)}
      onClick={() => set("timeControl", tc)}
      className={`h-12 rounded-control border-2 font-display text-base font-bold tabular-nums transition-colors duration-(--dur-press) ${wide ? "col-span-4" : ""} ${same(rules.timeControl, tc) ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface hover:border-ink-3"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <PresetStrip standard={standard} onReset={() => onChange(chessNaija)} />

      <fieldset>
        <legend className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
          Time · minutes + seconds per move
        </legend>
        <div className="space-y-2">
          {GROUPS.map((g) => (
            <div key={g.speed} className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
              <span className="text-sm font-semibold text-ink-2">{g.label}</span>
              <div className="grid grid-cols-4 gap-1.5">
                {TIME_PRESETS.filter((tc) => speedOf(tc) === g.speed).map((tc) =>
                  tile(tc, timeLabel(tc)),
                )}
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
            <span />
            <div className="grid grid-cols-4 gap-1.5">{tile(null, "No clock", true)}</div>
          </div>
        </div>
        {rules.timeControl === null ? (
          <div className="mt-3">
            <Segmented
              label="Time for each move"
              value={rules.moveLimitSeconds}
              onChange={(v) => set("moveLimitSeconds", v)}
              options={[60, 180, 300, 600].map((n) => ({ value: n, label: `${n / 60} min` }))}
            />
          </div>
        ) : null}
      </fieldset>

      <Section title="Playing">
        <Toggle
          label="Takebacks"
          hint="Ask to undo your last move. Your opponent decides."
          checked={rules.takebacks}
          onChange={(v) => set("takebacks", v)}
        />
        <Toggle
          label="Premoves"
          hint="Queue your next move while your opponent thinks."
          checked={rules.premoves}
          onChange={(v) => set("premoves", v)}
        />
      </Section>

      <Section title="Draws">
        <div className="px-4 py-4">
          <Segmented
            label="Same position 3 times, or 50 moves without a capture"
            value={rules.drawClaims}
            onChange={(v) => set("drawClaims", v)}
            options={[
              { value: "auto" as const, label: "Draw at once" },
              { value: "claim" as const, label: "Player claims" },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}
