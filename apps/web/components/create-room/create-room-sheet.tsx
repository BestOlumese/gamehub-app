"use client";

import { rpsNaija, type RpsRules } from "@gamehub/engine/rps";
import { tttNaija, type TttRules } from "@gamehub/engine/tictactoe";
import type { BotLevel } from "@gamehub/protocol";
import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { ChoiceCard } from "@gamehub/ui/forms/choice-card";
import { Segmented } from "@gamehub/ui/forms/segmented";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { Switch } from "@gamehub/ui/forms/switch";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { Bot, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { createRoom } from "@/app/(app)/play/actions";
import { describeRules, GAME_NAMES } from "@/lib/game-meta";
import { RpsRulesStep } from "./rps-rules-step";
import { TttRulesStep } from "./ttt-rules-step";

export type CreatableGame = "tictactoe" | "rps";

const LEVELS: ReadonlyArray<{ value: BotLevel; label: string }> = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

type Step = "players" | "rules" | "seats" | "review";
const STEP_LABEL: Record<Step, string> = {
  players: "Players",
  rules: "Rules",
  seats: "Empty seats",
  review: "Review",
};

type Props = { game: CreatableGame; open: boolean; onClose: () => void };

/** Step-by-step room setup. Games with a choice of player count get an extra first step. */
export function CreateRoomSheet({ game, open, onClose }: Props) {
  const steps: Step[] =
    game === "rps" ? ["players", "rules", "seats", "review"] : ["rules", "seats", "review"];
  const [i, setI] = useState(0);
  const [players, setPlayers] = useState(game === "rps" ? 4 : 2);
  const [tttRules, setTttRules] = useState<TttRules>(tttNaija);
  const [rpsRules, setRpsRules] = useState<RpsRules>(rpsNaija);
  // Two players: wait for a friend or play a bot. More: wait, optionally topping up with bots at start.
  const [seat, setSeat] = useState<"friend" | "bot">("friend");
  const [fillAtStart, setFillAtStart] = useState(true);
  const [level, setLevel] = useState<BotLevel>("medium");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const step = steps[i] ?? "review";
  const rules = game === "rps" ? rpsRules : tttRules;
  const duel = players === 2;

  function close() {
    onClose();
    setI(0);
    setError(null);
  }

  const botLevel: BotLevel | null = duel
    ? seat === "bot"
      ? level
      : null
    : fillAtStart
      ? level
      : null;
  const otherSeats = duel
    ? seat === "bot"
      ? `${LEVELS.find((l) => l.value === level)?.label} bot`
      : "A friend"
    : fillAtStart
      ? `Friends; bots (${level}) fill any empty seats at start`
      : "Friends only";

  function create() {
    setError(null);
    start(async () => {
      // Redirects into the room on success; only failures come back.
      const res = await createRoom({
        game,
        rules,
        botLevel,
        players,
        seatBotsNow: duel && seat === "bot",
      });
      setError(res.message);
    });
  }

  return (
    <Dialog open={open} onClose={close} title={GAME_NAMES[game]} description="Play with friends">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex gap-1.5" aria-hidden="true">
          {steps.map((s, n) => (
            <span
              key={s}
              className={`h-2 rounded-full transition-all duration-(--dur-sheet) ${n === i ? "w-6 bg-brand" : n < i ? "w-2 bg-brand" : "w-2 bg-line"}`}
            />
          ))}
        </div>
        <p className="text-sm font-semibold text-ink-2" aria-live="polite">
          Step {i + 1} of {steps.length}: {STEP_LABEL[step]}
        </p>
      </div>

      {step === "players" ? (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">How many players?</legend>
            <div className="grid grid-cols-7 gap-1.5">
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={players === n}
                  onClick={() => setPlayers(n)}
                  className={`h-12 rounded-control border-2 font-display text-lg font-bold transition-colors duration-(--dur-press) ${players === n ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface hover:border-ink-3"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="rounded-control bg-surface-2 px-4 py-3 text-sm text-ink-2">
            {duel
              ? "2 players: a one-on-one duel."
              : `${players} players: a knockout bracket. Win your match to go through.`}
          </p>
        </div>
      ) : null}

      {step === "rules" ? (
        game === "rps" ? (
          <RpsRulesStep rules={rpsRules} onChange={setRpsRules} />
        ) : (
          <TttRulesStep rules={tttRules} onChange={setTttRules} />
        )
      ) : null}

      {step === "seats" ? (
        duel ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              This is a 2-player game. Who should take the other seat?
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
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-ink-2">
              Share the link and friends take the seats. You can also add bots seat by seat from the
              room.
            </p>
            <div className="flex items-center justify-between gap-4 rounded-card border border-line p-4">
              <div>
                <p id="fill-label" className="font-semibold">
                  Fill empty seats with bots when I start
                </p>
                <p className="text-sm text-ink-2">So you never wait for one missing person.</p>
              </div>
              <Switch checked={fillAtStart} onChange={setFillAtStart} labelledBy="fill-label" />
            </div>
            {fillAtStart ? (
              <Segmented label="Bot level" value={level} onChange={setLevel} options={LEVELS} />
            ) : null}
          </div>
        )
      ) : null}

      {step === "review" ? (
        <div className="space-y-4">
          <dl className="divide-y divide-line rounded-card border border-line text-sm">
            {[
              ["Game", GAME_NAMES[game]],
              ...(game === "rps" ? [["Players", duel ? "2 (duel)" : `${players} (knockout)`]] : []),
              ["Rules", describeRules(game, rules)],
              [duel ? "Other seat" : "Seats", otherSeats],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-ink-2">{k}</dt>
                <dd className="text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {error ? <Alert>{error}</Alert> : null}
        </div>
      ) : null}

      <div className="mt-6 flex gap-3">
        {i > 0 ? (
          <Button variant="secondary" onClick={() => setI((n) => n - 1)} disabled={pending}>
            Back
          </Button>
        ) : null}
        {i < steps.length - 1 ? (
          <Button className="flex-1" onClick={() => setI((n) => n + 1)}>
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
