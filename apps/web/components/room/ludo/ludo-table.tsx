"use client";

import {
  HOME,
  target,
  type Colour,
  type LudoAction,
  type LudoRules,
  type LudoState,
} from "@gamehub/engine/ludo";
import type { ClientRoomMsg } from "@gamehub/protocol";
import { useRoom, type Snapshot } from "@/lib/room/store";
import { placeLabels } from "../places";
import { seatName } from "../rps/names";
import { LudoBoard } from "./board";
import { Die } from "../die";
import { COLOUR_HEX, cornerOf, TURNS } from "./geometry";
import { Panel } from "./panel";
import { LudoResult } from "./result-sheet";
import { useLudoFeed } from "./use-ludo-feed";

type Props = { snap: Snapshot; send: (m: ClientRoomMsg) => void };

/** Board in the middle, turned so you're bottom-left; a panel for each player at their corner. */
export default function LudoTable({ snap, send }: Props) {
  const offset = useRoom((s) => s.offset);
  const pending = useRoom((s) => s.pending);
  const connection = useRoom((s) => s.connection);
  const view = snap.view as LudoState;
  const rules = snap.room.rules as LudoRules;
  const me = snap.you === "spectator" ? null : snap.you;
  const ended = snap.room.phase === "ended" || view.over;
  const turns = TURNS[view.colours[me ?? 0] as Colour];
  const feed = useLudoFeed(snap.seats, me);

  const myTurn = me !== null && !ended && view.turn === me;
  const ready = connection === "open" && pending === null && !feed.playing;
  const canRoll = myTurn && view.phase === "roll" && ready;
  const canMove = myTurn && view.phase === "move" && ready;
  const targets = new Map<number, number>();
  if (canMove && me !== null && view.die !== null) {
    for (const seed of view.movable) {
      const to = target(view, me, seed, view.die, rules);
      if (to !== null) targets.set(seed, to);
    }
  }

  function act(action: LudoAction) {
    const id = crypto.randomUUID();
    useRoom.setState({ pending: { id, action } });
    send({ t: "act", id, v: snap.v, a: action });
  }

  // The die sits with whoever is playing, but a roll stays on show for a moment after the
  // turn moves on (a 3 that can't be used would otherwise vanish at once).
  const roll = feed.roll ?? (view.lastRoll ? { ...view.lastRoll, key: 0, stale: true } : null);
  const dieSeat = ended
    ? null
    : feed.playing && roll
      ? roll.seat
      : roll && !roll.stale && view.phase === "roll"
        ? roll.seat
        : view.turn;
  // While a turn plays back on screen, it's still that player's go.
  const playingSeat = feed.actor ?? view.turn;

  const corners: Array<number | null> = [null, null, null, null];
  view.colours.forEach((c, seat) => {
    corners[cornerOf(c, turns)] = seat;
  });
  const places = placeLabels(view.finished.map((s) => [s]));

  const panel = (corner: number) => {
    const seat = corners[corner];
    const info = seat === null || seat === undefined ? undefined : snap.seats[seat];
    if (seat === null || seat === undefined || !info) return <div />;
    const colour = COLOUR_HEX[view.colours[seat] as Colour];
    const active = !ended && playingSeat === seat;
    const endsAt = snap.deadlines.turns?.[seat];
    const showDie = dieSeat === seat;
    return (
      <Panel
        seat={info}
        index={seat}
        seats={snap.seats}
        colour={colour}
        isYou={seat === me}
        active={active}
        clock={
          active && view.turn === seat && endsAt
            ? { endsAt, totalMs: rules.turnSeconds * 1000 }
            : null
        }
        offset={offset}
        home={(view.seeds[seat] ?? []).filter((p) => p === HOME).length}
        place={places.get(seat)}
        graceEndsAt={snap.deadlines.graceEndsAt?.[seat]}
        mirror={corner === 1 || corner === 2}
        die={
          showDie ? (
            <Die
              value={roll?.seat === seat ? roll.value : null}
              rollKey={roll?.seat === seat ? roll.key : 0}
              colour={colour}
              canRoll={seat === me && canRoll}
              onRoll={() => canRoll && act({ type: "roll" })}
            />
          ) : (
            <span className="block size-11" aria-hidden="true" />
          )
        }
      />
    );
  };

  const banner = ended
    ? null
    : feed.playing && feed.actor !== me
      ? { text: `${seatName(snap.seats, playingSeat)}'s turn`, you: false }
      : myTurn && !feed.playing
        ? view.phase === "roll"
          ? { text: "Your turn. Tap the die", you: true }
          : { text: "Pick a seed to move", you: true }
        : playingSeat === me
          ? { text: "Your turn", you: true }
          : { text: `${seatName(snap.seats, playingSeat)}'s turn`, you: false };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-2 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        {panel(0)}
        {panel(1)}
      </div>
      <div className="rounded-card border border-line bg-surface p-1.5 shadow-sm">
        <LudoBoard
          state={feed.seeds ? { ...view, seeds: feed.seeds } : view}
          turns={turns}
          mover={canMove ? me : null}
          targets={targets}
          onSeed={(seed) => canMove && targets.has(seed) && act({ type: "move", seed })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {panel(3)}
        {panel(2)}
      </div>
      {/* The board as words, for screen readers (and tests). */}
      <ul className="sr-only" aria-label="Seeds">
        {view.colours.map((c, seat) => {
          const seeds = feed.seeds?.[seat] ?? view.seeds[seat] ?? [];
          const yard = seeds.filter((p) => p === -1).length;
          const home = seeds.filter((p) => p === HOME).length;
          return (
            <li key={seat} data-testid={`seeds-${c}`}>
              {seatName(snap.seats, seat)}, {c}: {yard} in the yard, {4 - yard - home} on the board
              ({seeds.filter((p) => p >= 0 && p < HOME).join(", ") || "none"}), {home} home
            </li>
          );
        })}
      </ul>
      <p className="h-5 truncate text-center text-sm font-semibold text-ink-2" aria-live="polite">
        {feed.line ?? ""}
      </p>
      <div className="h-11" aria-live="polite">
        {banner ? (
          <p
            className={`flex h-11 items-center justify-center rounded-control px-4 text-center font-semibold ${banner.you ? "bg-accent text-ink" : "bg-surface-2 text-ink-2"}`}
          >
            {banner.text}
          </p>
        ) : null}
      </div>
      {me === null ? <p className="text-center text-sm text-ink-2">You&apos;re watching.</p> : null}
      {ended && view.over ? (
        <LudoResult
          view={view}
          seats={snap.seats}
          you={snap.you}
          onRematch={() => send({ t: "rematch" })}
        />
      ) : null}
    </div>
  );
}
