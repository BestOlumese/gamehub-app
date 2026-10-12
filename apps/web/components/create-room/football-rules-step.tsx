"use client";

import { footballNaija, type FootballRules } from "@gamehub/engine/football";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { useState } from "react";
import { PresetStrip, Section, Toggle } from "./rule-controls";

type Props = { rules: FootballRules; players: number; onChange: (r: FootballRules) => void };

const LUCK_HINT: Record<FootballRules["draftLuck"], string> = {
  balanced: "Most teams rate 82–84, with a few stars. Legends are rare.",
  wild: "Bigger swings: dream teams and disasters. More Legends.",
  elite: "Only top players. Teams rate 85–87.",
};

/** Format, the draft, the match. Starts on Naija Standard. */
export function FootballRulesStep({ rules, players, onChange }: Props) {
  const standard = JSON.stringify(rules) === JSON.stringify(footballNaija);
  const set = <K extends keyof FootballRules>(k: K, v: FootballRules[K]) =>
    onChange({ ...rules, [k]: v });
  return (
    <div className="space-y-5">
      <PresetStrip standard={standard} onReset={() => onChange(footballNaija)} />
      <div className="space-y-4">
        {players === 1 ? (
          <p className="px-1 text-sm text-ink-2">
            Solo run: you against four bot teams, each stronger than the last. One loss ends it.
          </p>
        ) : players === 2 ? (
          <Segmented
            label="Format"
            value={rules.mode === "h2h_bo3" ? "h2h_bo3" : "h2h_single"}
            onChange={(v) => set("mode", v)}
            options={[
              { value: "h2h_single" as const, label: "Single match" },
              { value: "h2h_bo3" as const, label: "Best of 3" },
            ]}
          />
        ) : (
          <Segmented
            label="Format"
            value={
              rules.mode === "league" || rules.mode === "knockout"
                ? rules.mode
                : players <= 5
                  ? "league"
                  : "knockout"
            }
            onChange={(v) => set("mode", v)}
            options={[
              { value: "league" as const, label: "Mini league" },
              { value: "knockout" as const, label: "Knockout" },
            ]}
          />
        )}
        <div className="space-y-1">
          <Segmented
            label="Draft luck"
            value={rules.draftLuck}
            onChange={(v) => set("draftLuck", v)}
            options={[
              { value: "balanced" as const, label: "Balanced" },
              { value: "wild" as const, label: "Wild" },
              { value: "elite" as const, label: "Elite" },
            ]}
          />
          <p className="px-1 text-sm text-ink-2">{LUCK_HINT[rules.draftLuck]}</p>
        </div>
        <Segmented
          label="Time for each pick"
          value={rules.turnSeconds}
          onChange={(v) => set("turnSeconds", v)}
          options={[10, 20, 30].map((n) => ({ value: n, label: `${n} s` }))}
        />
        <MatchLength
          value={rules.playbackSecondsPerHalf}
          halfTime={rules.halfTimeSeconds}
          onChange={(v) => set("playbackSecondsPerHalf", v)}
        />
        <div className="space-y-1">
          <Segmented
            label="Playback"
            value={rules.highlights ? "highlights" : "even"}
            onChange={(v) => set("highlights", v === "highlights")}
            options={[
              { value: "highlights" as const, label: "Highlights" },
              { value: "even" as const, label: "Every minute" },
            ]}
          />
          <p className="px-1 text-sm text-ink-2">
            {rules.highlights
              ? "Quiet minutes fly by; attacks play out slowly so you can follow them."
              : "Every minute takes the same time."}
          </p>
        </div>
      </div>
      <Section title="Playing">
        <Toggle
          label="Chemistry"
          hint="Players from the same nation or club play better together."
          checked={rules.chemistry}
          onChange={(v) => set("chemistry", v)}
        />
        <div className="px-4 py-4">
          <Segmented
            label="Subs per match"
            value={rules.subsPerMatch}
            onChange={(v) => set("subsPerMatch", v)}
            options={[
              { value: 3 as const, label: "3" },
              { value: 5 as const, label: "5" },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}

const LENGTHS = [
  { s: 40, label: "Quick", sub: "40 s" },
  { s: 60, label: "Standard", sub: "60 s" },
  { s: 120, label: "Long", sub: "2 min" },
  { s: 240, label: "Full", sub: "4 min" },
] as const;
const MIN_HALF = 20;
const MAX_HALF = 600;
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** Match length per half: four presets, or a custom time (design decision, Oct 2026). */
function MatchLength({
  value,
  halfTime,
  onChange,
}: {
  value: number;
  halfTime: number;
  onChange: (sec: number) => void;
}) {
  const preset = LENGTHS.some((l) => l.s === value);
  const [custom, setCustom] = useState(!preset);
  // 10 s steps up to 2 minutes, 30 s steps above.
  const step = (dir: 1 | -1) => {
    const inc = value > 120 || (value === 120 && dir > 0) ? 30 : 10;
    onChange(Math.min(MAX_HALF, Math.max(MIN_HALF, value + dir * inc)));
  };
  const total = Math.round((value * 2 + halfTime) / 60);
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 px-1 text-sm font-semibold">Match length (per half)</legend>
      <div className="grid grid-cols-4 gap-1.5">
        {LENGTHS.map((l) => {
          const on = !custom && value === l.s;
          return (
            <button
              key={l.s}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setCustom(false);
                onChange(l.s);
              }}
              className={`flex flex-col items-center rounded-control border px-1 py-1.5 ${on ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface"}`}
            >
              <span className="text-sm font-semibold">{l.label}</span>
              <span className="text-xs text-ink-2">{l.sub}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 px-1">
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => setCustom(true)}
          className={`text-sm font-semibold ${custom ? "text-brand-strong" : "text-ink-2 underline"}`}
        >
          Custom
        </button>
        {custom ? (
          <div className="flex items-center gap-2" role="group" aria-label="Custom half length">
            <button
              type="button"
              aria-label="Shorter"
              disabled={value <= MIN_HALF}
              onClick={() => step(-1)}
              className="size-9 rounded-control border border-line bg-surface text-lg font-bold disabled:opacity-40"
            >
              −
            </button>
            <span className="w-14 text-center font-bold tabular-nums" aria-live="polite">
              {clock(value)}
            </span>
            <button
              type="button"
              aria-label="Longer"
              disabled={value >= MAX_HALF}
              onClick={() => step(1)}
              className="size-9 rounded-control border border-line bg-surface text-lg font-bold disabled:opacity-40"
            >
              +
            </button>
          </div>
        ) : null}
      </div>
      <p className="px-1 text-sm text-ink-2">
        A match takes about {total} minute{total === 1 ? "" : "s"} with half time.
      </p>
    </fieldset>
  );
}
