"use client";

import {
  DRAUGHTS_TIME_PRESETS,
  draughtsEnglish,
  draughtsNaija,
  timeLabel,
  type DraughtsRules,
  type TimeControl,
} from "@gamehub/engine/draughts";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { DRAUGHTS_COLOUR } from "@/lib/game-meta";
import { PresetStrip, Section, Toggle } from "./rule-controls";

type Props = { rules: DraughtsRules; onChange: (r: DraughtsRules) => void };

const same = (a: TimeControl, b: TimeControl) =>
  a === b ||
  (!!a && !!b && a.baseSeconds === b.baseSeconds && a.incrementSeconds === b.incrementSeconds);

/** Board first (Naija draft or English checkers), then time, captures and draws. */
export function DraughtsRulesStep({ rules, onChange }: Props) {
  const naija = rules.variant === "naija10";
  const standard = JSON.stringify(rules) === JSON.stringify(draughtsNaija);
  const set = <K extends keyof DraughtsRules>(k: K, v: DraughtsRules[K]) =>
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
      <PresetStrip standard={standard} onReset={() => onChange(draughtsNaija)} />

      <Segmented
        label="Board"
        value={rules.variant}
        onChange={(v) =>
          // English checkers fixes its own capture rules; going back restores Naija ones.
          onChange(
            v === "english8"
              ? { ...rules, ...draughtsEnglish, timeControl: rules.timeControl }
              : {
                  ...rules,
                  ...draughtsNaija,
                  timeControl: rules.timeControl,
                  moveLimitSeconds: rules.moveLimitSeconds,
                  missedCapture: rules.missedCapture,
                  drawRules: rules.drawRules,
                  takebacks: rules.takebacks,
                },
          )
        }
        options={[
          { value: "naija10" as const, label: "Naija draft 10×10" },
          { value: "english8" as const, label: "English 8×8" },
        ]}
      />
      {!naija ? (
        <p className="-mt-3 px-1 text-sm text-ink-2">
          English checkers: 12 seeds each, {DRAUGHTS_COLOUR.dark} moves first, men take forward only
          and kings move one square.
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
          Time · minutes + seconds per move
        </legend>
        <div className="grid grid-cols-4 gap-1.5">
          {DRAUGHTS_TIME_PRESETS.map((tc) => tile(tc, timeLabel(tc)))}
          {tile(null, "No clock", true)}
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

      <Section title="Capturing">
        {naija ? (
          <div className="px-4 py-4">
            <Segmented
              label="When you can take more than one way"
              value={rules.captureRule}
              onChange={(v) => set("captureRule", v)}
              options={[
                { value: "free" as const, label: "Any capture" },
                { value: "majority" as const, label: "Take the most" },
              ]}
            />
          </div>
        ) : null}
        <Toggle
          label="Men take backward"
          hint="A man may jump a seed behind it, not only in front."
          checked={rules.variant === "english8" ? false : rules.menCaptureBackward}
          onChange={(v) => set("menCaptureBackward", v)}
          disabled={!naija}
        />
        <Toggle
          label="Flying kings"
          hint="Kings move and take any distance along a free diagonal."
          checked={rules.variant === "english8" ? false : rules.flyingKings}
          onChange={(v) => set("flyingKings", v)}
          disabled={!naija}
        />
        <Toggle
          label="Huffing"
          hint="Captures aren't forced. Miss one and your opponent may blow the seed that could have taken."
          checked={rules.missedCapture === "huff"}
          onChange={(v) => set("missedCapture", v ? "huff" : "forced")}
        />
      </Section>

      {naija ? (
        <Section title="Board and start">
          <div className="space-y-4 px-4 py-4">
            <Segmented
              label="Board: Naija has the long diagonal on your right"
              value={rules.orientation}
              onChange={(v) => set("orientation", v)}
              options={[
                { value: "naija" as const, label: "Naija" },
                { value: "fmjd" as const, label: "FMJD" },
              ]}
            />
            <Segmented
              label="Whoever moves first plays"
              value={rules.firstMove}
              onChange={(v) => set("firstMove", v)}
              options={[
                { value: "random" as const, label: "Either colour" },
                { value: "light" as const, label: DRAUGHTS_COLOUR.light },
                { value: "dark" as const, label: DRAUGHTS_COLOUR.dark },
              ]}
            />
          </div>
        </Section>
      ) : null}

      <Section title="Playing">
        <Toggle
          label="Takebacks"
          hint="Ask to undo your last move. Your opponent decides."
          checked={rules.takebacks}
          onChange={(v) => set("takebacks", v)}
        />
      </Section>

      <Section title="Draws">
        <div className="px-4 py-4">
          <Segmented
            label={
              naija
                ? "25 king-only moves each, and the lone-king endings"
                : "40 moves each without a man move or a capture"
            }
            value={rules.drawRules}
            onChange={(v) => set("drawRules", v)}
            options={[
              { value: "standard" as const, label: "Draw" },
              { value: "none" as const, label: "Play on" },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}
