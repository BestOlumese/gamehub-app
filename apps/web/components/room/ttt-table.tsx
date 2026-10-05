"use client";

import { tttLegalActions, type TttRules, type TttState } from "@gamehub/engine/tictactoe";
import type { ClientRoomMsg, SeatPublic } from "@gamehub/protocol";
import { useRoom, type Snapshot } from "@/lib/room/store";
import { ResultCard } from "./result-card";
import { SeatChip } from "./seat-chip";
import { TttBoard } from "./ttt-board";

const MARKS = ["X", "O"] as const;
const name = (s: SeatPublic | undefined) => (s ? (s.userId ? `@${s.name}` : s.name) : "");

function Mark({ seat }: { seat: 0 | 1 }) {
  return (
    <span
      className={`rounded-md px-1.5 text-xs font-bold ${seat === 0 ? "bg-ink text-white" : "bg-brand text-white"}`}
      aria-label={`plays ${MARKS[seat]}`}
    >
      {MARKS[seat]}
    </span>
  );
}

type Props = { snap: Snapshot; send: (m: ClientRoomMsg) => void };

/** Face-off layout: opponent on top, board in the middle, you at the bottom. */
export function TttTable({ snap, send }: Props) {
  const offset = useRoom((s) => s.offset);
  const pending = useRoom((s) => s.pending);
  const rejects = useRoom((s) => s.rejects);
  const connection = useRoom((s) => s.connection);
  const state = snap.view as TttState;
  const rules = snap.room.rules as TttRules;
  const you = snap.you;
  const mySeat = you === "spectator" ? null : you;
  const bottom = (mySeat ?? 0) as 0 | 1;
  const top = (1 - bottom) as 0 | 1;
  const ended = snap.room.phase === "ended";

  const turnFor = (seat: number) => {
    const endsAt = snap.deadlines.turns?.[seat];
    return !ended && state.roundWinner === null && state.turn === seat && endsAt
      ? { endsAt, totalMs: rules.turnSeconds * 1000 }
      : null;
  };

  const myTurn = mySeat !== null && !ended && state.roundWinner === null && state.turn === mySeat;
  const canPlay = myTurn && connection === "open" && pending === null;
  const pendingCell =
    pending && typeof pending.action === "object" && pending.action && "cell" in pending.action
      ? Number((pending.action as { cell: number }).cell)
      : null;

  function play(cell: number) {
    if (!canPlay || mySeat === null) return;
    const action = { type: "place" as const, cell };
    // Pre-check with the same engine the server uses, then show the move straight away.
    if (!tttLegalActions(state, mySeat).some((a) => a.type === "place" && a.cell === cell)) return;
    const id = crypto.randomUUID();
    useRoom.setState({ pending: { id, action } });
    send({ t: "act", id, v: snap.v, a: action });
  }

  const banner = ended
    ? null
    : state.roundWinner === "draw"
      ? { text: `Round ${state.round} is a draw. Next round coming…`, tone: "neutral" }
      : state.roundWinner !== null
        ? {
            text: `${state.roundWinner === mySeat ? "You win" : `${name(snap.seats[state.roundWinner])} wins`} round ${state.round}. Next round coming…`,
            tone: "neutral",
          }
        : myTurn
          ? { text: "Your turn", tone: "you" }
          : { text: `${name(snap.seats[state.turn])}'s turn`, tone: "neutral" };

  const roundLabel =
    state.round > rules.bestOf
      ? "Sudden death"
      : rules.bestOf === 1
        ? "One game"
        : `Round ${state.round} of ${rules.bestOf}`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between gap-4 px-4 py-4">
      <div className="rounded-card border border-line bg-surface p-3 shadow-sm">
        {snap.seats[top] ? (
          <SeatChip
            seat={snap.seats[top]}
            mark={<Mark seat={top} />}
            turn={turnFor(top)}
            graceEndsAt={snap.deadlines.graceEndsAt?.[top]}
            offset={offset}
            score={state.score[top]}
          />
        ) : null}
      </div>

      <div>
        <p className="mb-3 text-center text-sm font-semibold text-ink-2">
          {roundLabel}
          {state.draws ? ` · ${state.draws} drawn` : ""}
        </p>
        <TttBoard
          state={state}
          pendingCell={pendingCell}
          mySeat={mySeat}
          canPlay={canPlay}
          onPlay={play}
          shakeKey={rejects}
        />
        <div className="mt-4 h-11" aria-live="polite">
          {banner ? (
            <p
              className={`flex h-11 items-center justify-center rounded-control px-4 text-center font-semibold ${banner.tone === "you" ? "bg-accent text-ink" : "bg-surface-2 text-ink-2"}`}
            >
              {banner.text}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className={`rounded-card border bg-surface p-3 shadow-sm ${myTurn ? "border-accent" : "border-line"}`}
      >
        {snap.seats[bottom] ? (
          <SeatChip
            seat={snap.seats[bottom]}
            isYou={mySeat === bottom}
            mark={<Mark seat={bottom} />}
            turn={turnFor(bottom)}
            graceEndsAt={snap.deadlines.graceEndsAt?.[bottom]}
            offset={offset}
            score={state.score[bottom]}
          />
        ) : null}
      </div>

      {ended ? (
        <ResultCard
          state={state}
          seats={snap.seats}
          you={you}
          onRematch={() => send({ t: "rematch" })}
        />
      ) : null}
    </div>
  );
}
