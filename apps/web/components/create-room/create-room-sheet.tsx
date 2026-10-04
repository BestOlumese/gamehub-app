"use client";

import { tttNaija, type TttRules } from "@gamehub/engine/tictactoe";
import type { BotLevel } from "@gamehub/protocol";
import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { ChoiceCard } from "@gamehub/ui/forms/choice-card";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { Bot, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { createRoom } from "@/app/(app)/play/actions";
import { describeTttRules, TttRulesStep } from "./ttt-rules-step";

const STEPS = ["Rules", "Empty seat", "Review"] as const;
const LEVELS: ReadonlyArray<{ value: BotLevel; label: string }> = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

type Props = { open: boolean; onClose: () => void };

/** Step-by-step room setup (Tic-tac-toe for now; other games plug in their own rules step). */
export function CreateRoomSheet({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [rules, setRules] = useState<TttRules>(tttNaija);
  const [seat, setSeat] = useState<"friend" | "bot">("friend");
  const [level, setLevel] = useState<BotLevel>("medium");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    onClose();
    setStep(0);
    setError(null);
  }

  function create() {
    setError(null);
    start(async () => {
      // Redirects into the room on success; only failures come back.
      const res = await createRoom({
        game: "tictactoe",
        rules,
        botLevel: seat === "bot" ? level : null,
      });
      setError(res.message);
    });
  }

  return (
    <Dialog open={open} onClose={close} title="Tic-tac-toe" description="Play with friends">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-2 rounded-full transition-all duration-(--dur-sheet) ${i === step ? "w-6 bg-brand" : i < step ? "w-2 bg-brand" : "w-2 bg-line"}`}
            />
          ))}
        </div>
        <p className="text-sm font-semibold text-ink-2" aria-live="polite">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </div>

      {step === 0 ? <TttRulesStep rules={rules} onChange={setRules} /> : null}

      {step === 1 ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            Tic-tac-toe is for 2. Who should take the other seat?
          </p>
          <ChoiceCard
            name="seat"
            checked={seat === "friend"}
            onChange={() => setSeat("friend")}
            icon={<Users size={20} aria-hidden="true" />}
            title="Wait for a friend"
            description="You'll get a link to send them. You can still add a bot from the room."
          />
          <ChoiceCard
            name="seat"
            checked={seat === "bot"}
            onChange={() => setSeat("bot")}
            icon={<Bot size={20} aria-hidden="true" />}
            title="Play a bot"
            description="Start straight away against the computer."
          >
            <Segmented label="Bot level" value={level} onChange={setLevel} options={LEVELS} />
          </ChoiceCard>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <dl className="divide-y divide-line rounded-card border border-line text-sm">
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ink-2">Game</dt>
              <dd className="font-semibold">Tic-tac-toe</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ink-2">Rules</dt>
              <dd className="text-right font-semibold">{describeTttRules(rules)}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ink-2">Other seat</dt>
              <dd className="font-semibold">
                {seat === "bot"
                  ? `${LEVELS.find((l) => l.value === level)?.label} bot`
                  : "A friend"}
              </dd>
            </div>
          </dl>
          {error ? <Alert>{error}</Alert> : null}
        </div>
      ) : null}

      <div className="mt-6 flex gap-3">
        {step > 0 ? (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={pending}>
            Back
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button className="flex-1" onClick={() => setStep((s) => s + 1)}>
            Next
          </Button>
        ) : (
          <Button className="flex-1" onClick={create} disabled={pending}>
            {pending ? <Spinner /> : null}
            {pending ? "Making your room" : "Create room"}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
