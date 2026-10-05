"use client";

import { ludoNaija, type LudoRules } from "@gamehub/engine/ludo";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { PresetStrip, Section, Toggle } from "./rule-controls";

type Props = { rules: LudoRules; onChange: (r: LudoRules) => void };
type Flag = {
  [K in keyof LudoRules]: LudoRules[K] extends boolean ? K : never;
}[keyof LudoRules];

/** Every Ludo rule, grouped. Starts on Naija Standard; one tap puts it back. */
export function LudoRulesStep({ rules, onChange }: Props) {
  const standard = JSON.stringify(rules) === JSON.stringify(ludoNaija);
  const set = <K extends keyof LudoRules>(k: K, v: LudoRules[K]) => onChange({ ...rules, [k]: v });
  const flag = (k: Flag) => ({ checked: rules[k], onChange: (v: boolean) => set(k, v) });

  return (
    <div className="space-y-5">
      <PresetStrip standard={standard} onReset={() => onChange(ludoNaija)} />

      <Section title="Rolling">
        <Toggle
          label="Need a 6 to come out"
          hint="Seeds leave the yard only on a 6."
          {...flag("needSixToLeaveYard")}
        />
        <Toggle
          label="6 rolls again"
          hint="Roll a 6, play, then roll again."
          {...flag("sixRollsAgain")}
        />
        <div className="px-4 py-4">
          <Segmented
            label="Sixes in a row that end your turn"
            value={rules.maxConsecutiveSixes}
            onChange={(v) => set("maxConsecutiveSixes", v)}
            options={[
              { value: 3, label: "3" },
              { value: 4, label: "4" },
              { value: 0, label: "Never" },
            ]}
          />
        </div>
        <div className="px-4 py-4">
          <Segmented
            label="Time per turn"
            value={rules.turnSeconds}
            onChange={(v) => set("turnSeconds", v)}
            options={[15, 30, 45, 60].map((n) => ({ value: n, label: `${n} s` }))}
          />
        </div>
      </Section>

      <Section title="Capturing">
        <Toggle
          label="Capture"
          hint="Land on a rival to send it back to its yard."
          {...flag("captureSendsHome")}
        />
        <Toggle
          label="Capture earns a roll"
          hint="Roll again after you send someone home."
          disabled={!rules.captureSendsHome}
          {...flag("captureGivesBonusRoll")}
        />
        <Toggle
          label="Safe squares"
          hint="No capturing on start squares and stars."
          {...flag("safeSquares")}
        />
        <Toggle
          label="Blockades"
          hint="Two seeds of one colour on a square block everyone else."
          {...flag("blockades")}
        />
      </Section>

      <Section title="Getting home">
        <Toggle
          label="Exact roll to finish"
          hint="The roll must fit the squares left to home."
          {...flag("exactRollToFinish")}
        />
        <Toggle
          label="Home earns a roll"
          hint="Roll again when a seed gets home."
          {...flag("homeGivesBonusRoll")}
        />
        <Toggle
          label="Auto-move"
          hint="When only one seed can move, it moves by itself."
          {...flag("autoMoveSingle")}
        />
      </Section>

      <Section title="Ending">
        <div className="px-4 py-4">
          <Segmented
            label="When someone gets all 4 home"
            value={rules.endMode}
            onChange={(v) => set("endMode", v)}
            options={[
              { value: "playOn", label: "Play on" },
              { value: "firstFinisherEnds", label: "Game ends" },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}
