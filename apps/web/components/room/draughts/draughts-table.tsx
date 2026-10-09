"use client";

import {
  afterMove,
  boardOf,
  clockShows,
  effective,
  firstTurn,
  legalMoves,
  notation,
  other,
  pdnFen,
  seatOf,
  seedCount,
  type Colour,
  type DraughtsAction,
  type DraughtsMove,
  type DraughtsRules,
  type DraughtsView,
} from "@gamehub/engine/draughts";
import type { ClientRoomMsg } from "@gamehub/protocol";
import { Button } from "@gamehub/ui/forms/button";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { ArrowDownUp, Flag, Handshake, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DRAUGHTS_COLOUR, draughtsVariantName } from "@/lib/game-meta";
import { useRoom, type Snapshot } from "@/lib/room/store";
import { MoveStrip } from "../board-games/move-strip";
import { PlayerCard } from "../board-games/player-card";
import { ToolButton } from "../board-games/tool-button";
import { seatName } from "../rps/names";
import { sfx } from "../sounds";
import { useNow } from "../use-now";
import { DraughtsBoard, seedName } from "./board";
import { choose, finalsFrom, hop, parseTyped } from "./pick";
import { DraughtsResult } from "./result-sheet";
import { useDraughtsFeed } from "./use-draughts-feed";

type Props = { snap: Snapshot; send: (m: ClientRoomMsg) => void };
/** Choosing between two captures that end on the same square: the hops tapped so far. */
type Route = { to: number; hops: number[]; next: number[] };

const DOT: Record<Colour, string> = { light: "bg-[#D33A2C]", dark: "bg-[#1F7A3D]" };
const CAP: Record<Colour, string> = { light: "#dc-l", dark: "#dc-d" };

/** Your think time for a move, from when the position reached this phone. */
const thinkTime = (since: number) => Math.max(0, Date.now() - since);

function timeText(r: DraughtsRules) {
  const tc = r.timeControl;
  if (!tc) return `No clock · ${r.moveLimitSeconds / 60} min a move`;
  return tc.incrementSeconds
    ? `${tc.baseSeconds / 60} min + ${tc.incrementSeconds} s a move`
    : `${tc.baseSeconds / 60} min each`;
}

/** Seeds a side has taken: a small cap of the other colour and a count. */
function Taken({ side, count }: { side: Colour; count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-ink" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="size-4">
        <use href={CAP[other(side)]} />
      </svg>
      {count}
    </span>
  );
}

/** Opponent above the board, you below, moves and buttons under it: the chess layout (Best, Oct 2026). */
export default function DraughtsTable({ snap, send }: Props) {
  const offset = useRoom((s) => s.offset);
  const pending = useRoom((s) => s.pending);
  const connection = useRoom((s) => s.connection);
  const view = snap.view as DraughtsView;
  const rules = effective(snap.room.rules as DraughtsRules);
  const you = view.you;
  const ended = snap.room.phase === "ended" || !!view.result;
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [resigning, setResigning] = useState(false);
  const turnSeenAt = useRef(0);
  const feed = useDraughtsFeed(you);

  const lightSeat = seatOf(view, "light");
  const darkSeat = seatOf(view, "dark");
  const myTurn = !!you && !ended && view.turn === you;
  const ready = connection === "open" && pending === null;
  const ply = view.moves.length;
  const legal = myTurn || pending ? legalMoves(view, rules) : [];

  // Your move shows at once; the server's snapshot replaces it.
  const pendingAction = pending?.action as DraughtsAction | undefined;
  const pendingMove =
    pendingAction?.type === "move"
      ? (legal.find(
          (m) => m.from === pendingAction.from && m.path.join() === pendingAction.path.join(),
        ) ?? null)
      : null;
  const shownBoard =
    viewing !== null
      ? boardOf(view.history[viewing] ?? "")
      : pendingMove
        ? afterMove(view, pendingMove)
        : pendingAction?.type === "huff"
          ? view.board.map((v, i) => (i === pendingAction.square - 1 ? 0 : v))
          : view.board;
  const shownMove: DraughtsMove | null =
    viewing !== null
      ? (view.moves[viewing - 1] ?? null)
      : (pendingMove ?? view.moves.at(-1) ?? null);
  const lastSquares = shownMove ? [shownMove.from, ...shownMove.path] : [];
  // The seeds the last move took fade out together, after the move (Turkish strike).
  const lastMove = view.moves.at(-1);
  const before = ply ? boardOf(view.history[ply - 1] ?? "") : null;
  const fading =
    viewing === null && !pendingMove && lastMove?.captured.length && before
      ? {
          key: ply,
          seeds: lastMove.captured.map((sq) => ({ sq, v: before[sq - 1] as number })),
        }
      : null;

  // Think time is measured from when the position reached this phone.
  useEffect(() => {
    if (myTurn) turnSeenAt.current = Date.now();
  }, [myTurn, ply]);

  // Keyboards: ← and → step through the moves (not while typing a move).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement | null)?.closest("input, textarea")) return;
      if (e.key === "ArrowLeft") setViewing((v) => Math.max(0, (v ?? ply) - 1));
      else if (e.key === "ArrowRight")
        setViewing((v) => (v === null || v + 1 >= ply ? null : v + 1));
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ply]);

  function act(action: DraughtsAction) {
    const id = crypto.randomUUID();
    useRoom.setState({ pending: { id, action } });
    send({ t: "act", id, v: snap.v, a: action });
  }

  function play(m: DraughtsMove) {
    setSelected(null);
    setRoute(null);
    setHint(null);
    setViewing(null);
    act({
      type: "move",
      from: m.from,
      path: m.path,
      mt: thinkTime(turnSeenAt.current),
    });
  }

  const canMoveNow = myTurn && ready && viewing === null;
  const huffable = canMoveNow && view.huffable?.by === you ? view.huffable.squares : [];
  const capturing = legal.filter((m) => m.captured.length);
  const mustTake = canMoveNow && !selected ? [...new Set(capturing.map((m) => m.from))] : [];

  /** Tapping `to` with `from` selected: play, or start choosing a route. */
  function tryMove(from: number, to: number): boolean {
    const c = choose(legal, from, to);
    if (!c) return false;
    if ("move" in c) play(c.move);
    else {
      setRoute({ to, hops: [], next: c.next });
      setHint("Two ways to get there: tap the squares you land on, in order");
    }
    return true;
  }

  function tap(sq: number) {
    if (!canMoveNow) return;
    if (huffable.includes(sq)) {
      setSelected(null);
      setRoute(null);
      act({ type: "huff", square: sq });
      return;
    }
    if (route && selected !== null) {
      const res = hop(legal, selected, route.to, route.hops, sq);
      if (res && "move" in res) return play(res.move);
      if (res) return setRoute({ to: route.to, ...res });
      setRoute(null);
      setHint(null);
    }
    if (selected !== null && selected !== sq && tryMove(selected, sq)) return;
    setSelected(legal.some((m) => m.from === sq) && selected !== sq ? sq : null);
  }

  const targets = route ? route.next : selected !== null ? finalsFrom(legal, selected) : [];

  function submitTyped() {
    if (!myTurn) return setHint("Wait for your turn");
    const res = parseTyped(legal, typed);
    if ("error" in res) return setHint(res.error);
    setTyped("");
    play(res.move);
  }

  async function copyPosition() {
    const fen = pdnFen(
      shownBoard,
      viewing === null ? view.turn : viewing % 2 === 0 ? firstTurn(view) : other(firstTurn(view)),
    );
    try {
      await navigator.clipboard.writeText(fen);
      setHint("Position copied (PDN FEN)");
    } catch {
      setHint(fen);
    }
  }

  // Clocks, on server time.
  const running = !ended && ply >= 2 && !!view.clock;
  const now = useNow(running, 100) + offset;
  const clockOf = (side: Colour) => {
    const ms = clockShows(view, side, now);
    return ms === null ? null : { ms, running: running && view.turn === side };
  };
  const myMs = you ? clockOf(you) : null;
  const tickSecond = myMs?.running && myMs.ms < 10_000 ? Math.ceil(myMs.ms / 1000) : null;
  useEffect(() => {
    if (tickSecond !== null && useRoom.getState().soundOn) sfx.tick();
  }, [tickSecond]);

  const counts = seedCount(view);
  const bottomSide: Colour = flipped ? other(you ?? "light") : (you ?? "light");
  const topSide = other(bottomSide);
  const card = (side: Colour) => {
    const seat = side === "light" ? lightSeat : darkSeat;
    const info = snap.seats[seat];
    if (!info) return null;
    const taken = counts.takenBy[side];
    return (
      <PlayerCard
        seat={info}
        isYou={side === you}
        dot={DOT[side]}
        taken={<Taken side={side} count={taken} />}
        takenLabel={taken ? `Taken: ${taken} seeds` : undefined}
        clock={clockOf(side)}
        toMove={!ended && view.turn === side}
        graceEndsAt={snap.deadlines.graceEndsAt?.[seat]}
        offset={offset}
      />
    );
  };

  const opp = you ? other(you) : null;
  const offerFromThem = !ended && opp && view.drawOffer?.by === opp;
  const takebackFromThem = !ended && opp && view.takeback?.by === opp;
  const canOfferDraw =
    !!you &&
    !ended &&
    ply >= 2 &&
    !view.drawOffer &&
    view.offersUsed.draw[you] < 3 &&
    (view.drawDeclinedAt[you] === null || ply - (view.drawDeclinedAt[you] ?? 0) >= 20);
  const canTakeback =
    !!you &&
    !ended &&
    rules.takebacks &&
    !view.takeback &&
    view.offersUsed.takeback[you] < 3 &&
    ply >= (you === firstTurn(view) ? 1 : 2);

  const most = capturing.reduce((n, m) => Math.max(n, m.captured.length), 0);
  const status = ended
    ? null
    : ply < 2 && myTurn
      ? "Your move. Make it within 30 s or the game is aborted"
      : myTurn && huffable.length
        ? "Missed capture: tap the red ring to huff"
        : myTurn && capturing.length && rules.missedCapture === "forced"
          ? rules.captureRule === "majority"
            ? `You must take ${most}`
            : "You must take"
          : myTurn
            ? "Your move"
            : `${seatName(snap.seats, view.turn === "light" ? lightSeat : darkSeat)} to move`;
  const last = view.moves.at(-1);
  const lastBy = ply % 2 === 1 ? firstTurn(view) : other(firstTurn(view));

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-2 px-3 py-3">
      {card(topSide)}

      {/* Capped by screen height so the buttons stay on a 360 × 640 phone. */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-card border border-line shadow-sm"
        style={{ maxWidth: "max(16rem, calc(100dvh - 23rem))" }}
      >
        <DraughtsBoard
          variant={view.variant}
          orientation={rules.orientation}
          flip={bottomSide === "dark"}
          board={shownBoard}
          lastSquares={lastSquares}
          fading={fading}
          selected={selected}
          targets={targets}
          route={route?.hops ?? []}
          mustTake={mustTake}
          huffable={huffable}
          canPick={(sq) => canMoveNow && legal.some((m) => m.from === sq)}
          onTap={tap}
          onDrop={(from, to) => {
            if (!canMoveNow || !tryMove(from, to)) setSelected(null);
          }}
        />
      </div>

      {card(bottomSide)}

      {/* The board as buttons, for screen readers, keyboards (and tests). */}
      <div className="sr-only" role="group" aria-label="Board squares">
        {shownBoard.map((v, i) => {
          const sq = i + 1;
          return (
            <button key={sq} type="button" onClick={() => tap(sq)}>
              {`${sq}, ${v ? seedName(v) : "empty"}${targets.includes(sq) ? ", can move here" : ""}${huffable.includes(sq) ? ", can be huffed" : ""}`}
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {last
          ? `${DRAUGHTS_COLOUR[lastBy]}: ${last.captured.length ? `capture ${notation(last)}` : notation(last)}`
          : ""}
      </p>

      <MoveStrip san={view.moves.map(notation)} viewing={viewing} onView={setViewing} />
      <p className="-mt-1 text-center text-xs text-ink-3">
        {draughtsVariantName(view)}
        {view.variant === "naija10" && rules.orientation === "naija" ? " · Naija board" : ""} ·{" "}
        {timeText(rules)}
      </p>

      {offerFromThem ? (
        <div className="flex items-center gap-2 rounded-control bg-accent-soft px-3 py-2 text-sm font-semibold">
          <span className="flex-1">{seatName(snap.seats, seatOf(view, opp))} offers a draw</span>
          <Button size="md" onClick={() => act({ type: "accept_draw" })} disabled={!ready}>
            Accept
          </Button>
          <Button
            size="md"
            variant="secondary"
            onClick={() => act({ type: "decline_draw" })}
            disabled={!ready}
          >
            Decline
          </Button>
        </div>
      ) : takebackFromThem ? (
        <div className="flex items-center gap-2 rounded-control bg-accent-soft px-3 py-2 text-sm font-semibold">
          <span className="flex-1">
            {seatName(snap.seats, seatOf(view, opp))} wants to take back
          </span>
          <Button size="md" onClick={() => act({ type: "accept_takeback" })} disabled={!ready}>
            Allow
          </Button>
          <Button
            size="md"
            variant="secondary"
            onClick={() => act({ type: "decline_takeback" })}
            disabled={!ready}
          >
            No
          </Button>
        </div>
      ) : (
        <p className="h-5 truncate text-center text-sm font-semibold text-ink-2" aria-live="polite">
          {route ? hint : (feed ?? status ?? "")}
        </p>
      )}

      {you && !ended ? (
        <div className="grid grid-cols-4 gap-1.5" role="toolbar" aria-label="Game actions">
          {ply < 2 ? (
            <ToolButton
              icon={<X size={18} />}
              label="Abort"
              onClick={() => act({ type: "abort" })}
              disabled={!ready}
            />
          ) : (
            <ToolButton
              icon={<Handshake size={18} />}
              label="Draw"
              onClick={() => act({ type: "offer_draw" })}
              disabled={!ready || !canOfferDraw}
            />
          )}
          <ToolButton
            icon={<Undo2 size={18} />}
            label="Take back"
            onClick={() => act({ type: "request_takeback" })}
            disabled={!ready || !canTakeback}
          />
          <ToolButton
            icon={<Flag size={18} />}
            label="Resign"
            onClick={() => setResigning(true)}
            disabled={!ready || ply < 2}
          />
          <ToolButton
            icon={<ArrowDownUp size={18} />}
            label="Flip board"
            onClick={() => setFlipped((f) => !f)}
          />
        </div>
      ) : !you ? (
        <p className="text-center text-sm text-ink-2">You&apos;re watching.</p>
      ) : null}

      {/* Computers: type a move, copy the position. Hidden on phones to keep the board big. */}
      <form
        className="hidden flex-wrap items-center gap-2 sm:flex"
        onSubmit={(e) => {
          e.preventDefault();
          submitTyped();
        }}
      >
        {you && !ended ? (
          <input
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setHint(null);
            }}
            aria-label="Type a move"
            placeholder="Type a move: 32-28, 28x19x10"
            autoComplete="off"
            spellCheck={false}
            className="h-10 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm"
          />
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          onClick={copyPosition}
          className="rounded-control px-2 py-1 text-sm font-semibold text-brand-strong hover:bg-brand-soft"
        >
          Copy position
        </button>
        {hint && !route ? (
          <p className="w-full truncate text-xs text-ink-2" aria-live="polite">
            {hint}
          </p>
        ) : null}
      </form>

      <Dialog
        open={resigning}
        onClose={() => setResigning(false)}
        title="Resign this game?"
        description="Your opponent wins."
      >
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setResigning(false)}>
            Keep playing
          </Button>
          <Button
            onClick={() => {
              setResigning(false);
              act({ type: "resign" });
            }}
          >
            Resign
          </Button>
        </div>
      </Dialog>

      {ended && view.result ? (
        <DraughtsResult
          view={view}
          seats={snap.seats}
          rules={rules}
          light={lightSeat}
          dark={darkSeat}
          onRematch={() => send({ t: "rematch" })}
        />
      ) : null}
    </div>
  );
}
