"use client";

import { whotNaija, type WhotRules } from "@gamehub/engine/whot";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { PresetStrip, Section, Toggle } from "./rule-controls";

type Props = { rules: WhotRules; onChange: (r: WhotRules) => void };
type Flag = {
  [K in keyof WhotRules]: WhotRules[K] extends boolean ? K : never;
}[keyof WhotRules];

const Num = ({ n }: { n: number }) => (
  <span className="mr-2 inline-flex size-6 items-center justify-center rounded-md bg-surface-2 font-display text-sm font-bold text-whot">
    {n}
  </span>
);

/** Every Whot rule, grouped. Starts on Naija Standard; one tap puts it back. */
export function WhotRulesStep({ rules, onChange }: Props) {
  const standard = JSON.stringify(rules) === JSON.stringify(whotNaija);
  const set = <K extends keyof WhotRules>(k: K, v: WhotRules[K]) => onChange({ ...rules, [k]: v });
  const flag = (k: Flag) => ({ checked: rules[k], onChange: (v: boolean) => set(k, v) });

  return (
    <div className="space-y-5">
      <PresetStrip standard={standard} onReset={() => onChange(whotNaija)} />

      <Section title="Dealing">
        <div className="space-y-4 px-4 py-4">
          <Segmented
            label="Cards each"
            value={rules.handSize}
            onChange={(v) => set("handSize", v)}
            options={[4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }))}
          />
          <Segmented
            label="Time per turn"
            value={rules.turnSeconds}
            onChange={(v) => set("turnSeconds", v)}
            options={[15, 30, 45, 60].map((n) => ({ value: n, label: `${n} s` }))}
          />
        </div>
      </Section>

      <Section title="Special cards">
        <Toggle
          label={
            <>
              <Num n={1} />
              Hold on
            </>
          }
          hint="You play again."
          {...flag("holdOn")}
        />
        <Toggle
          label={
            <>
              <Num n={2} />
              Pick two
            </>
          }
          hint="Next player picks 2."
          {...flag("pickTwo")}
        />
        <Toggle
          label={
            <>
              <Num n={5} />
              Pick three
            </>
          }
          hint="Next player picks 3."
          {...flag("pickThree")}
        />
        <Toggle
          label={
            <>
              <Num n={8} />
              Suspension
            </>
          }
          hint="Next player misses a turn."
          {...flag("suspension")}
        />
        <Toggle
          label={
            <>
              <Num n={14} />
              General market
            </>
          }
          hint="Everyone else picks 1, then you play again."
          {...flag("generalMarket")}
        />
      </Section>

      <Section title="Penalties">
        <Toggle
          label="Defend with the same card"
          hint="Answer a 2 with a 2, or a 5 with a 5. It adds up."
          {...flag("stackPenalties")}
        />
        <Toggle
          label="Mix 2s and 5s"
          hint="A 2 can answer a 5, and a 5 a 2."
          disabled={!rules.stackPenalties}
          {...flag("crossStack")}
        />
      </Section>

      <Section title="Last card">
        <Toggle
          label="Must say Last card"
          hint="Forget, and you pick when the next player moves."
          {...flag("mustDeclareLastCard")}
        />
        {rules.mustDeclareLastCard ? (
          <div className="px-4 py-4">
            <Segmented
              label="Cards to pick for forgetting"
              value={rules.lastCardPenalty}
              onChange={(v) => set("lastCardPenalty", v)}
              options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
            />
          </div>
        ) : null}
        <Toggle
          label="Say Check up to win"
          hint="Tap Check up with your winning card."
          {...flag("checkUpRequired")}
        />
      </Section>

      <Section title="Ending">
        <Toggle
          label="Finish on a special card"
          hint="Your last card can be a 1, 2, 5, 8, 14 or Whot."
          {...flag("canFinishOnSpecial")}
        />
        <div className="space-y-4 px-4 py-4">
          <Segmented
            label="When the market runs out"
            value={rules.marketExhausted}
            onChange={(v) => set("marketExhausted", v)}
            options={[
              { value: "count", label: "Count cards" },
              { value: "reshuffle", label: "Reshuffle" },
            ]}
          />
          <Segmented
            label="When someone finishes"
            value={rules.multiWinner}
            onChange={(v) => set("multiWinner", v)}
            options={[
              { value: "rankByCount", label: "Game ends" },
              { value: "playOn", label: "Play on" },
            ]}
          />
        </div>
        <Toggle
          label="First card counts"
          hint="A special card turned up at the start takes effect."
          checked={rules.firstCardEffect === "apply"}
          onChange={(v) => set("firstCardEffect", v ? "apply" : "none")}
        />
      </Section>
    </div>
  );
}
