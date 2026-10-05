"use client";

import { rpsNaija, type RpsRules } from "@gamehub/engine/rps";
import { ChoiceCard } from "@gamehub/ui/forms/choice-card";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { describeRpsRules } from "@/lib/game-meta";

type Props = { rules: RpsRules; onChange: (r: RpsRules) => void };

export function RpsRulesStep({ rules, onChange }: Props) {
  const isStandard = JSON.stringify(rules) === JSON.stringify(rpsNaija);
  return (
    <div className="space-y-3">
      <ChoiceCard
        name="preset"
        checked={isStandard}
        onChange={() => onChange(rpsNaija)}
        title="Naija Standard"
        description={describeRpsRules(rpsNaija)}
      />
      <ChoiceCard
        name="preset"
        checked={!isStandard}
        onChange={() => onChange({ ...rpsNaija, bestOf: 5 })}
        title="Custom"
        description="Set match length and throw time."
      >
        <div className="space-y-5 pt-1">
          <Segmented
            label="Each match"
            value={rules.bestOf}
            onChange={(bestOf) => onChange({ ...rules, bestOf })}
            options={[
              { value: 1, label: "1 throw" },
              { value: 3, label: "Best of 3" },
              { value: 5, label: "Best of 5" },
            ]}
          />
          <Segmented
            label="Time to throw"
            value={rules.turnSeconds}
            onChange={(turnSeconds) => onChange({ ...rules, turnSeconds })}
            options={[
              { value: 10, label: "10 s" },
              { value: 15, label: "15 s" },
              { value: 30, label: "30 s" },
            ]}
          />
        </div>
      </ChoiceCard>
    </div>
  );
}
