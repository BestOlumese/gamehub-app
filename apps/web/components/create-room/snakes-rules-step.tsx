"use client";

import { BOARD_IDS, BOARDS, snakesNaija, type SnakesRules } from "@gamehub/engine/snakes";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { SnakesBoardBase } from "@/components/room/snakes/board";
import { PresetStrip, Section, Toggle } from "./rule-controls";

type Props = { rules: SnakesRules; onChange: (r: SnakesRules) => void };
type Flag = {
  [K in keyof SnakesRules]: SnakesRules[K] extends boolean ? K : never;
}[keyof SnakesRules];

/** Pick a board, then every rule. Starts on Naija Standard; one tap puts it back. */
export function SnakesRulesStep({ rules, onChange }: Props) {
  const standard = JSON.stringify(rules) === JSON.stringify(snakesNaija);
  const set = <K extends keyof SnakesRules>(k: K, v: SnakesRules[K]) =>
    onChange({ ...rules, [k]: v });
  const flag = (k: Flag) => ({ checked: rules[k], onChange: (v: boolean) => set(k, v) });

  return (
    <div className="space-y-5">
      <PresetStrip standard={standard} onReset={() => onChange(snakesNaija)} />

      <fieldset>
        <legend className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
          Board
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {BOARD_IDS.map((id) => {
            const b = BOARDS[id];
            const on = rules.board === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => set("board", id)}
                className={`rounded-card border-2 p-2 text-left transition-colors duration-(--dur-press) ${on ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-ink-3"}`}
              >
                <svg
                  viewBox="0 0 100 100"
                  className="block h-auto w-full rounded-control"
                  aria-hidden="true"
                >
                  <SnakesBoardBase board={id} plain />
                </svg>
                <p className="mt-1.5 font-semibold">{b.name}</p>
                <p className="text-xs text-ink-2">{b.blurb}</p>
              </button>
            );
          })}
        </div>
      </fieldset>

      <Section title="Rolling">
        <Toggle
          label="6 rolls again"
          hint="Roll a 6, move, then roll again."
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
        <Toggle
          label="Need a 6 to start"
          hint="Stay off the board until you roll a 6."
          {...flag("needSixToStart")}
        />
        <Toggle
          label="Auto roll"
          hint="The die rolls by itself. Just watch."
          {...flag("autoRoll")}
        />
        <div className="px-4 py-4">
          <Segmented
            label="Time per turn"
            value={rules.turnSeconds}
            onChange={(v) => set("turnSeconds", v)}
            options={[10, 15, 30].map((n) => ({ value: n, label: `${n} s` }))}
          />
        </div>
      </Section>

      <Section title="On the board">
        <Toggle
          label="Bump"
          hint="Land on someone and send them back to the start."
          {...flag("bump")}
        />
        <Toggle
          label="Exact roll to finish"
          hint="Roll past 100 and you stay where you are."
          {...flag("exactRollToFinish")}
        />
      </Section>

      <Section title="Ending">
        <Toggle
          label="First to 100 ends it"
          hint="Off: everyone plays on for 2nd, 3rd and the rest."
          {...flag("firstFinisherEnds")}
        />
      </Section>
    </div>
  );
}
