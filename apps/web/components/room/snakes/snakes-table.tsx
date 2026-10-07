"use client";

import type { SnakesRules, SnakesState } from "@gamehub/engine/snakes";
import type { ClientRoomMsg } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Bot } from "lucide-react";
import { useRoom, type Snapshot } from "@/lib/room/store";
import { Die } from "../die";
import { placeLabels } from "../places";
import { seatName } from "../rps/names";
import { TimerRing } from "../timer-ring";
import { Pin, SnakesBoardBase } from "./board";
import { centre, TOKEN_COLOURS, type Pt } from "./geometry";
import { PlayersRow, TokenBadge } from "./players-row";
import { SnakesResult } from "./result-sheet";
import { useSnakesFeed } from "./use-snakes-feed";

type Props = { snap: Snapshot; send: (m: ClientRoomMsg) => void };

const initialOf = (name: string) => (name.replace(/^@/, "").charAt(0) || "?").toUpperCase();

/** Players on top, the board in the middle, your panel and die at the bottom. */
export default function SnakesTable({ snap, send }: Props) {
  const offset = useRoom((s) => s.offset);
  const pending = useRoom((s) => s.pending);
  const connection = useRoom((s) => s.connection);
  const view = snap.view as SnakesState;
  const rules = snap.room.rules as SnakesRules;
  const me = snap.you === "spectator" ? null : snap.you;
  const ended = snap.room.phase === "ended" || view.over;
  const feed = useSnakesFeed(snap.seats, me);
  const squares = feed.squares ?? view.pos;
  const playingSeat = feed.actor ?? view.turn;

  const myTurn = me !== null && !ended && view.turn === me;
  const canRoll =
    myTurn && !rules.autoRoll && connection === "open" && pending === null && !feed.playing;
  function rollDie() {
    if (!canRoll) return;
    const id = crypto.randomUUID();
    useRoom.setState({ pending: { id, action: { type: "roll" } } });
    send({ t: "act", id, v: snap.v, a: { type: "roll" } });
  }

  const places = placeLabels(view.finished.map((s) => [s]));
  const clockFor = (seat: number) => {
    const endsAt = snap.deadlines.turns?.[seat];
    return !ended && view.turn === seat && endsAt && !feed.playing
      ? { endsAt, totalMs: rules.turnSeconds * 1000 }
      : null;
  };
  const players = snap.seats.map((info, seat) => ({
    seat,
    info,
    square: squares[seat] ?? 0,
    place: places.get(seat),
    active: !ended && playingSeat === seat,
    clock: clockFor(seat),
  }));

  // Tokens on the board: group by square so several fan out; a sliding token follows its own point.
  const onBoard = new Map<number, number[]>();
  squares.forEach((sq, seat) => {
    if (sq <= 0 || feed.slide?.seat === seat) return;
    onBoard.set(sq, [...(onBoard.get(sq) ?? []), seat]);
  });
  const pinFor = (seat: number, at: Pt, scale: number) => (
    <Pin
      key={seat}
      seat={seat}
      initial={initialOf(snap.seats[seat]?.name ?? "")}
      x={at[0]}
      y={at[1]}
      scale={scale}
      active={!ended && playingSeat === seat && seat === me && canRoll}
    />
  );

  const meInfo = me === null ? null : snap.seats[me];
  const myClock = me === null ? null : clockFor(me);
  // No separate banner (it pushed the die off small phones): your turn shows in your panel,
  // anyone else's in the line above it.
  const yourGo = !ended && playingSeat === me;
  const status = ended || yourGo ? "" : `${seatName(snap.seats, playingSeat)}'s turn`;
  const where =
    me === null
      ? ""
      : (places.get(me) ?? ((squares[me] ?? 0) ? `Square ${squares[me]}` : "At the start"));

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-2 px-3 py-3">
      <PlayersRow players={players} seats={snap.seats} me={me} offset={offset} />

      <div>
        <div
          className="mx-auto w-full rounded-card border border-line bg-surface p-1.5 shadow-sm"
          style={{ maxWidth: "max(16rem, calc(100dvh - 17.5rem))" }}
        >
          <svg
            viewBox="0 0 100 100"
            className="block h-auto w-full select-none"
            role="img"
            aria-label="Snakes and Ladders board"
          >
            <SnakesBoardBase board={view.board} />
            {[...onBoard.entries()].map(([sq, seats]) => {
              const [cx, cy] = centre(sq);
              const k = seats.length;
              const scale = k > 3 ? 0.72 : k > 1 ? 0.85 : 1;
              return seats.map((seat, i) =>
                pinFor(seat, [cx + (i - (k - 1) / 2) * (k > 3 ? 1.9 : 2.6), cy], scale),
              );
            })}
            {feed.slide ? pinFor(feed.slide.seat, feed.slide.at, 1) : null}
          </svg>
        </div>
      </div>

      {/* The board as words, for screen readers. */}
      <ul className="sr-only" aria-label="Positions">
        {players.map((p) => (
          <li key={p.seat}>
            {seatName(snap.seats, p.seat)}:{" "}
            {p.place ? `finished ${p.place}` : p.square ? `square ${p.square}` : "not started"}
          </li>
        ))}
      </ul>

      <p className="h-5 truncate text-center text-sm font-semibold text-ink-2" aria-live="polite">
        {feed.line ?? status}
      </p>

      {meInfo && me !== null ? (
        <div
          className={`flex items-center gap-3 rounded-card border bg-surface p-3 shadow-sm ${yourGo ? "border-accent" : "border-line"}`}
        >
          <div className="relative shrink-0" style={{ width: 44, height: 44 }}>
            <div className="absolute inset-[5px]">
              {meInfo.userId ? (
                <Avatar username={meInfo.name || "?"} image={meInfo.avatar} size={34} />
              ) : (
                <Bot size={20} />
              )}
            </div>
            {myClock ? (
              <TimerRing key={myClock.endsAt} {...myClock} offset={offset} size={44} />
            ) : null}
            <span className="absolute -right-1 -bottom-1 rounded-full bg-surface p-px">
              <TokenBadge seat={me} size={16} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className={`truncate ${yourGo ? "font-bold" : "font-semibold"}`}>
              {yourGo ? "Your turn" : "You"}
            </p>
            <p className="truncate text-sm text-ink-2 tabular-nums">
              {canRoll ? `${where} · tap the die` : where}
            </p>
          </div>
          {/* Your last roll stays on your die, faded until it's your go again. */}
          <div className={`transition-opacity duration-(--dur-turn) ${yourGo ? "" : "opacity-45"}`}>
            <Die
              value={feed.mine?.value ?? (view.lastRoll?.seat === me ? view.lastRoll.value : null)}
              rollKey={feed.mine?.key ?? 0}
              colour={TOKEN_COLOURS[me % 8] as string}
              canRoll={canRoll}
              onRoll={rollDie}
            />
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-ink-2">You&apos;re watching.</p>
      )}

      {ended && view.over ? (
        <SnakesResult
          view={view}
          seats={snap.seats}
          you={snap.you}
          onRematch={() => send({ t: "rematch" })}
        />
      ) : null}
    </div>
  );
}
