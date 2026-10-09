"use client";

import { naira, plotsNaija, type PlotsRules } from "@gamehub/engine/plots";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { PresetStrip, Section, Toggle } from "./rule-controls";

type Props = { rules: PlotsRules; onChange: (r: PlotsRules) => void };

/** Mode and time first, then money, play and house rules. Starts on Naija Standard. */
export function PlotsRulesStep({ rules, onChange }: Props) {
  const standard = JSON.stringify(rules) === JSON.stringify(plotsNaija);
  const set = <K extends keyof PlotsRules>(k: K, v: PlotsRules[K]) =>
    onChange({ ...rules, [k]: v });
  return (
    <div className="space-y-5">
      <PresetStrip standard={standard} onReset={() => onChange(plotsNaija)} />

      <div className="space-y-4">
        <Segmented
          label="How it ends"
          value={rules.mode}
          onChange={(v) => set("mode", v)}
          options={[
            { value: "timed" as const, label: "Timed: richest wins" },
            { value: "classic" as const, label: "Last one standing" },
          ]}
        />
        {rules.mode === "timed" ? (
          <Segmented
            label="Game length"
            value={rules.timedMinutes}
            onChange={(v) => set("timedMinutes", v)}
            options={([30, 45, 60] as const).map((m) => ({ value: m, label: `${m} min` }))}
          />
        ) : (
          <p className="px-1 text-sm text-ink-2">
            Ends when everyone else is bankrupt, or after {rules.classicCapHours} hours (then the
            richest wins).
          </p>
        )}
        <Segmented
          label="Time for each action"
          value={rules.turnSeconds}
          onChange={(v) => set("turnSeconds", v)}
          options={[20, 30, 45, 60].map((n) => ({ value: n, label: `${n} s` }))}
        />
      </div>

      <Section title="Money">
        <div className="space-y-4 px-4 py-4">
          <Segmented
            label="Starting cash"
            value={rules.startCash}
            onChange={(v) => set("startCash", v)}
            options={[1500, 2000, 3000].map((n) => ({ value: n, label: naira(n) }))}
          />
          <Segmented
            label="Payday salary"
            value={rules.salary}
            onChange={(v) => set("salary", v)}
            options={[200, 300, 400].map((n) => ({ value: n, label: naira(n) }))}
          />
        </div>
      </Section>

      <Section title="Playing">
        <Toggle
          label="Auctions"
          hint="A plot nobody buys goes to auction; everyone can bid."
          checked={rules.auctions}
          onChange={(v) => set("auctions", v)}
        />
        <Toggle
          label="Trading"
          hint="Swap plots, cash and Bail cards with other players."
          checked={rules.trading}
          onChange={(v) => set("trading", v)}
        />
        <Toggle
          label="Doubles roll again"
          hint="Roll doubles and you go again after your move."
          checked={rules.doublesRollAgain}
          onChange={(v) => set("doublesRollAgain", v)}
        />
        <Toggle
          label="Three doubles: Police Post"
          hint="A third double in a row sends you to the Police Post."
          checked={rules.threeDoublesToPolice}
          onChange={(v) => set("threeDoublesToPolice", v)}
        />
        <Toggle
          label="Build evenly"
          hint="No plot more than one house ahead of the others in its group."
          checked={rules.evenBuilding}
          onChange={(v) => set("evenBuilding", v)}
        />
        <Toggle
          label="Rent at the Police Post"
          hint="You still collect rent while you're held there."
          checked={rules.rentWhileDetained}
          onChange={(v) => set("rentWhileDetained", v)}
        />
      </Section>

      <Section title="House rules">
        <Toggle
          label="Owambe jackpot"
          hint="Taxes and card fines go into a pot. Land on Owambe and it's yours."
          checked={rules.owambeJackpot}
          onChange={(v) => set("owambeJackpot", v)}
        />
        <Toggle
          label="Double salary on Payday"
          hint={`Land exactly on Payday for ${naira(rules.salary * 2)}.`}
          checked={rules.doubleSalaryOnExactLanding}
          onChange={(v) => set("doubleSalaryOnExactLanding", v)}
        />
      </Section>
    </div>
  );
}
