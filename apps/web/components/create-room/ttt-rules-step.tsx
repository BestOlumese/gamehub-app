"use client";

import { ChoiceCard } from "@gamehub/ui/forms/choice-card";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { Switch } from "@gamehub/ui/forms/switch";
import { tttNaija, type TttRules } from "@gamehub/engine/tictactoe";
import { describeTttRules } from "@/lib/game-meta";

type Props = { rules: TttRules; onChange: (r: TttRules) => void };

export function TttRulesStep({ rules, onChange }: Props) {
  const isStandard = JSON.stringify(rules) === JSON.stringify(tttNaija);
  return (
    <div className="space-y-3">
      <ChoiceCard
        name="preset"
        checked={isStandard}
        onChange={() => onChange(tttNaija)}
        title="Naija Standard"
        description={describeTttRules(tttNaija)}
      />
      <ChoiceCard
        name="preset"
        checked={!isStandard}
        onChange={() => onChange({ ...tttNaija, bestOf: 5 })}
        title="Custom"
        description="Set your own series length and turn time."
      >
        <div className="space-y-5 pt-1">
          <Segmented
            label="Series"
            value={rules.bestOf}
            onChange={(bestOf) => onChange({ ...rules, bestOf })}
            options={[
              { value: 1, label: "1 game" },
              { value: 3, label: "Best of 3" },
              { value: 5, label: "Best of 5" },
            ]}
          />
          <Segmented
            label="Time per turn"
            value={rules.turnSeconds}
            onChange={(turnSeconds) => onChange({ ...rules, turnSeconds })}
            options={[
              { value: 10, label: "10 s" },
              { value: 15, label: "15 s" },
              { value: 30, label: "30 s" },
              { value: 60, label: "60 s" },
            ]}
          />
          <div className="flex items-center justify-between gap-4">
            <span id="swap-label" className="text-sm font-semibold">
              Swap who starts each round
            </span>
            <Switch
              checked={rules.alternateStarter}
              onChange={(alternateStarter) => onChange({ ...rules, alternateStarter })}
              labelledBy="swap-label"
            />
          </div>
        </div>
      </ChoiceCard>
    </div>
  );
}
