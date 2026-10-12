"use client";

import { footballNaija, type FootballRules } from "@gamehub/engine/football";
import { Segmented } from "@gamehub/ui/forms/segmented";
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
        <Segmented
          label="How long a half takes"
          value={rules.playbackSecondsPerHalf}
          onChange={(v) => set("playbackSecondsPerHalf", v)}
          options={[30, 40, 60].map((n) => ({ value: n, label: `${n} s` }))}
        />
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
