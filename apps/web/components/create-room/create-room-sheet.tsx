"use client";

import { rpsNaija, type RpsRules } from "@gamehub/engine/rps";
import { tttNaija, type TttRules } from "@gamehub/engine/tictactoe";
import { ludoNaija, type LudoRules } from "@gamehub/engine/ludo";
import { snakesNaija, type SnakesRules } from "@gamehub/engine/snakes";
import { dealSize, whotNaija, type WhotRules } from "@gamehub/engine/whot";
import type { BotLevel, FirstPlayer } from "@gamehub/protocol";
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
import {
  describeRules,
  FIRST_PLAYER,
  GAME_NAMES,
  hasFirstPlayer,
  PLAYER_RANGE,
} from "@/lib/game-meta";
import { RpsRulesStep } from "./rps-rules-step";
import { LudoRulesStep } from "./ludo-rules-step";
import { SnakesRulesStep } from "./snakes-rules-step";
import { TttRulesStep } from "./ttt-rules-step";
import { WhotRulesStep } from "./whot-rules-step";

export type CreatableGame = "tictactoe" | "rps" | "whot" | "ludo" | "snakes";
const CREATABLE: readonly CreatableGame[] = ["whot", "ludo", "snakes", "tictactoe", "rps"];

/** Everything the sheet decides; the lobby's Edit sends it as one `config` message. */
export type RoomSetup = {
  game: CreatableGame;
  rules: unknown;
  players: number;
  botLevel: BotLevel | null;
  firstPlayer: FirstPlayer;
  seatBotsNow: boolean;
};

const LEVELS: ReadonlyArray<{ value: BotLevel; label: string }> = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];
const FIRST_OPTIONS = (Object.keys(FIRST_PLAYER) as FirstPlayer[]).map((value) => ({
  value,
  label: FIRST_PLAYER[value].label,
}));

type Step = "game" | "players" | "rules" | "seats" | "review";
const STEP_LABEL: Record<Step, string> = {
  game: "Game",
  players: "Players",
  rules: "Rules",
  seats: "Seats",
  review: "Review",
};

type Props = {
  open: boolean;
  onClose: () => void;
} & (
  | { game: CreatableGame; edit?: undefined }
  | {
      game?: undefined;
      /** Editing a room from its lobby: starts from the room's setup; `seated` people can't be dropped. */
      edit: {
        initial: Omit<RoomSetup, "seatBotsNow">;
        seated: number;
        onSave: (s: RoomSetup) => void;
      };
    }
);

/** Step-by-step room setup, for a new room or (with `edit`) the room you're in. */
export function CreateRoomSheet({ open, onClose, ...props }: Props) {
  const initial = props.edit?.initial;
  const seated = props.edit?.seated ?? 1;
  const [game, setGame] = useState<CreatableGame>(initial?.game ?? props.game ?? "whot");
  const rulesFor = <R,>(g: CreatableGame, preset: R): R =>
    initial?.game === g ? (initial.rules as R) : preset;
  const [tttRules, setTttRules] = useState<TttRules>(() => rulesFor("tictactoe", tttNaija));
  const [rpsRules, setRpsRules] = useState<RpsRules>(() => rulesFor("rps", rpsNaija));
  const [whotRules, setWhotRules] = useState<WhotRules>(() => rulesFor("whot", whotNaija));
  const [ludoRules, setLudoRules] = useState<LudoRules>(() => rulesFor("ludo", ludoNaija));
  const [snakesRules, setSnakesRules] = useState<SnakesRules>(() =>
    rulesFor("snakes", snakesNaija),
  );
  const [min, max] = PLAYER_RANGE[game];
  const [wanted, setPlayers] = useState(initial?.players ?? Math.min(4, max));
  // Switching game keeps the count where it fits, and never below the people already here.
  const players = Math.min(max, Math.max(min, seated, wanted));
  const [i, setI] = useState(0);
  // Two players: wait for a friend or play a bot. More: wait, optionally topping up with bots at start.
  const [seat, setSeat] = useState<"friend" | "bot">("friend");
  const [fillAtStart, setFillAtStart] = useState(initial ? initial.botLevel !== null : true);
  const [level, setLevel] = useState<BotLevel>(initial?.botLevel ?? "medium");
  const [firstPlayer, setFirstPlayer] = useState<FirstPlayer>(initial?.firstPlayer ?? "random");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const editing = !!props.edit;
  const multi = max > 2;
  const steps: Step[] = [
    ...(editing ? (["game"] as const) : []),
    ...(multi ? (["players"] as const) : []),
    "rules",
    "seats",
    "review",
  ];
  const step = steps[i] ?? "review";
  const rules =
    game === "rps"
      ? rpsRules
      : game === "whot"
        ? whotRules
        : game === "ludo"
          ? ludoRules
          : game === "snakes"
            ? snakesRules
            : tttRules;
  const counts = Array.from({ length: max - min + 1 }, (_, k) => min + k);
  const duel = players === 2;
  // In a 2-player room that already has both people, there's no other seat to fill.
  const openSeats = players - seated;

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
  const otherSeats =
    duel && openSeats <= 0
      ? "Both seats taken"
      : duel
        ? seat === "bot"
          ? `${LEVELS.find((l) => l.value === level)?.label} bot`
          : "A friend"
        : fillAtStart
          ? `Friends; bots (${level}) fill any empty seats at start`
          : "Friends only";
  const setup: RoomSetup = {
    game,
    rules,
    players,
    botLevel,
    firstPlayer,
    seatBotsNow: duel && seat === "bot" && openSeats > 0,
  };

  function finish() {
    setError(null);
    if (props.edit) {
      props.edit.onSave(setup);
      close();
      return;
    }
    start(async () => {
      // Redirects into the room on success; only failures come back.
      const res = await createRoom(setup);
      setError(res.message);
    });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={editing ? "Room settings" : GAME_NAMES[game]}
      description={editing ? "Changes apply to the next game" : "Play with friends"}
    >
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

      {step === "game" ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Which game next?</legend>
          {CREATABLE.map((g) => {
            const [gMin, gMax] = PLAYER_RANGE[g];
            const tooMany = seated > gMax;
            return (
              <ChoiceCard
                key={g}
                name="game"
                checked={game === g}
                disabled={tooMany}
                onChange={() => setGame(g)}
                title={GAME_NAMES[g]}
                description={
                  tooMany
                    ? `Up to ${gMax} players. ${seated} are here.`
                    : gMin === gMax
                      ? `${gMax} players`
                      : `${gMin}–${gMax} players`
                }
              />
            );
          })}
        </fieldset>
      ) : null}

      {step === "players" ? (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">How many players?</legend>
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${counts.length}, minmax(0, 1fr))` }}
            >
              {counts.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={players === n}
                  disabled={n < seated}
                  onClick={() => setPlayers(n)}
                  className={`h-12 rounded-control border-2 font-display text-lg font-bold transition-colors duration-(--dur-press) disabled:opacity-35 ${players === n ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface hover:border-ink-3"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
          {editing && seated > min ? (
            <p className="text-sm text-ink-2">
              {seated} people are in the room, so you can&apos;t go below {seated}.
            </p>
          ) : null}
          <p className="rounded-control bg-surface-2 px-4 py-3 text-sm text-ink-2">
            {game === "snakes"
              ? `${players} players race from 1 to 100. Climb the ladders, dodge the snakes.`
              : game === "ludo"
                ? players === 2
                  ? "2 players sit opposite each other: red v yellow."
                  : `${players} players, 4 seeds each. First to get all 4 home wins.`
                : game === "whot"
                  ? `${players} players, ${dealSize(players, whotRules.handSize)} cards each. First to empty their hand wins.`
                  : duel
                    ? "2 players: a one-on-one duel."
                    : `${players} players: a knockout bracket. Win your match to go through.`}
          </p>
        </div>
      ) : null}

      {step === "rules" ? (
        game === "rps" ? (
          <RpsRulesStep rules={rpsRules} onChange={setRpsRules} />
        ) : game === "whot" ? (
          <WhotRulesStep rules={whotRules} onChange={setWhotRules} />
        ) : game === "ludo" ? (
          <LudoRulesStep rules={ludoRules} onChange={setLudoRules} />
        ) : game === "snakes" ? (
          <SnakesRulesStep rules={snakesRules} onChange={setSnakesRules} />
        ) : (
          <TttRulesStep rules={tttRules} onChange={setTttRules} />
        )
      ) : null}

      {step === "seats" ? (
        <div className="space-y-5">
          {duel && openSeats <= 0 ? null : duel ? (
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
                Share the link and friends take the seats. You can also add bots seat by seat from
                the room.
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
          )}
          {hasFirstPlayer(game) ? (
            <div className="space-y-2">
              <Segmented
                label="Who goes first"
                value={firstPlayer}
                onChange={setFirstPlayer}
                options={FIRST_OPTIONS}
              />
              <p className="px-1 text-sm text-ink-2">{FIRST_PLAYER[firstPlayer].hint}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === "review" ? (
        <div className="space-y-4">
          <dl className="divide-y divide-line rounded-card border border-line text-sm">
            {[
              ["Game", GAME_NAMES[game]],
              ...(game === "rps" ? [["Players", duel ? "2 (duel)" : `${players} (knockout)`]] : []),
              ...(game === "whot" || game === "ludo" || game === "snakes"
                ? [["Players", String(players)]]
                : []),
              ["Rules", describeRules(game, rules)],
              [duel ? "Other seat" : "Seats", otherSeats],
              ...(hasFirstPlayer(game) ? [["Goes first", FIRST_PLAYER[firstPlayer].short]] : []),
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
          <Button className="flex-1" onClick={finish} disabled={pending}>
            {pending ? <Spinner /> : null}
            {editing ? "Save changes" : pending ? "Making your room" : "Create room"}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
