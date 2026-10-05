"use client";

import { THROWS, type MatchView, type RpsRules, type Throw } from "@gamehub/engine/rps";
import type { SeatPublic } from "@gamehub/protocol";
import { ThrowArt } from "@gamehub/ui/art/throw-art";
import { Check } from "lucide-react";
import { SeatChip } from "../seat-chip";
import { THROW_LABEL, ThrowCard } from "./throw-card";
import { CHANT, type RevealPhase } from "./use-reveal";

const VERB: Record<Throw, string> = { rock: "blunts", paper: "covers", scissors: "cut" };

type Props = {
  match: MatchView;
  me: number;
  seats: SeatPublic[];
  rules: RpsRules;
  turns: Partial<Record<number, number>>;
  graceEndsAt: Partial<Record<number, number>> | undefined;
  offset: number;
  phase: RevealPhase;
  canThrow: boolean;
  pendingPick: Throw | null;
  onThrow: (pick: Throw) => void;
};

export function DuelView({
  match,
  me,
  seats,
  rules,
  turns,
  graceEndsAt,
  offset,
  phase,
  canThrow,
  pendingPick,
  onThrow,
}: Props) {
  const meA = match.a === me;
  const opp = (meA ? match.b : match.a) ?? 0;
  // During the chant the server already knows the result; hold the score back until the flip.
  const held =
    phase.kind === "chant" && phase.reveal.result !== "tie"
      ? phase.reveal.result === match.a
        ? "a"
        : "b"
      : null;
  const scoreA = match.score[0] - (held === "a" ? 1 : 0);
  const scoreB = match.score[1] - (held === "b" ? 1 : 0);
  const myScore = meA ? scoreA : scoreB;
  const oppScore = meA ? scoreB : scoreA;
  const oppName = seats[opp]?.userId ? `@${seats[opp]?.name}` : (seats[opp]?.name ?? "");

  const reveal = phase.kind === "idle" ? null : phase.reveal;
  const showing = phase.kind === "show" && reveal;
  const myRevealed = reveal ? (meA ? reveal.a : reveal.b) : null;
  const oppRevealed = reveal ? (meA ? reveal.b : reveal.a) : null;
  const result = showing
    ? reveal.result === "tie"
      ? "tie"
      : reveal.result === me
        ? "win"
        : "lose"
    : null;

  const myCard = phase.kind !== "idle" ? myRevealed : (match.mine ?? pendingPick);
  const oppCard = showing ? oppRevealed : null;
  const oppThrown = match.thrown.includes(opp);

  const turnFor = (seat: number) => {
    const endsAt = turns[seat];
    return endsAt && phase.kind === "idle" ? { endsAt, totalMs: rules.turnSeconds * 1000 } : null;
  };

  let line = `Throw ${match.history.length + 1}`;
  if (showing && reveal) {
    if (reveal.result === "tie") line = "Tie. Throw again.";
    else {
      const w = reveal.result === match.a ? reveal.a : reveal.b;
      const l = reveal.result === match.a ? reveal.b : reveal.a;
      const how = `${THROW_LABEL[w]} ${VERB[w]} ${THROW_LABEL[l].toLowerCase()}`;
      line = reveal.coin
        ? `Too many ties. Coin flip: ${reveal.result === me ? "you take it" : `${oppName} takes it`}`
        : `${how}. ${reveal.result === me ? "You win the throw" : `${oppName} wins the throw`}`;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between gap-3 px-4 py-4">
      <div className="rounded-card border border-line bg-surface p-3 shadow-sm">
        {seats[opp] ? (
          <SeatChip
            seat={seats[opp]}
            turn={turnFor(opp)}
            graceEndsAt={graceEndsAt?.[opp]}
            offset={offset}
            score={oppScore}
          />
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-3">
        <div
          className="flex items-center gap-2 text-sm font-semibold text-ink-2"
          aria-live="polite"
        >
          {phase.kind === "idle" ? (
            oppThrown ? (
              <>
                <Check size={16} className="text-brand" aria-hidden="true" /> {oppName} has thrown
              </>
            ) : (
              `${oppName} is choosing…`
            )
          ) : null}
        </div>
        <ThrowCard
          pick={oppCard}
          outcome={result === "win" ? "lose" : result === "lose" ? "win" : result}
          label={oppName}
        />
        <p
          className="min-h-6 text-center font-display text-lg font-extrabold"
          aria-live="assertive"
        >
          {phase.kind === "chant" ? CHANT[phase.beat] : line}
        </p>
        <p className="text-sm text-ink-2 tabular-nums">
          {rules.bestOf > 1 ? `Best of ${rules.bestOf} · ` : ""}
          {myScore} – {oppScore}
        </p>
        <ThrowCard pick={myCard} outcome={result} size="lg" label="Your throw" />
      </div>

      <div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Your throw">
          {THROWS.map((t) => (
            <button
              key={t}
              type="button"
              disabled={!canThrow || phase.kind !== "idle"}
              onClick={() => onThrow(t)}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-card border-2 bg-surface shadow-sm transition-[transform,border-color] duration-(--dur-press) active:scale-95 disabled:opacity-50 ${(match.mine ?? pendingPick) === t ? "border-brand bg-brand-soft" : "border-line hover:border-brand"}`}
            >
              <ThrowArt pick={t} className="size-3/5" />
              <span className="text-sm font-bold">{THROW_LABEL[t]}</span>
            </button>
          ))}
        </div>
        <div
          className={`mt-3 rounded-card border bg-surface p-3 shadow-sm ${canThrow && phase.kind === "idle" ? "border-accent" : "border-line"}`}
        >
          {seats[me] ? (
            <SeatChip
              seat={seats[me]}
              isYou
              turn={turnFor(me)}
              graceEndsAt={graceEndsAt?.[me]}
              offset={offset}
              score={myScore}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
