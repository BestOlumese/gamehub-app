"use client";

import {
  Chess,
  clockShows,
  halfmoveClock,
  material,
  repetitions,
  seatOf,
  sideToMove,
  type ChessAction,
  type ChessRules,
  type ChessView,
  type Side,
} from "@gamehub/engine/chess";
import type { ClientRoomMsg } from "@gamehub/protocol";
import { Button } from "@gamehub/ui/forms/button";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { ArrowDownUp, Flag, Handshake, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRoom, type Snapshot } from "@/lib/room/store";
import { seatName } from "../rps/names";
import { sfx } from "../sounds";
import { useNow } from "../use-now";
import { ChessBoard, pieceName, piecesOf } from "./board";
import { MoveStrip } from "./move-strip";
import { PlayerCard } from "./player-card";
import { ChessResult } from "./result-sheet";
import { parseTypedMove } from "./move-input";
import { timeControlText } from "./time-control";
import { useChessFeed } from "./use-chess-feed";

type Props = { snap: Snapshot; send: (m: ClientRoomMsg) => void };
type Promo = { from: string; to: string; premove: boolean };

const other = (s: Side): Side => (s === "w" ? "b" : "w");
const FILES = "abcdefgh";

/** Legal destinations of the piece on `square` (chess.js, one piece at a time: cheap). */
function targetsOf(fen: string, square: string): string[] {
  try {
    return new Chess(fen).moves({ square: square as never, verbose: true }).map((m) => m.to);
  } catch {
    return [];
  }
}

/** Premoves: where the piece could go if it were your move now (checked again when it is). */
function premoveTargets(fen: string, square: string, side: Side): string[] {
  const parts = fen.split(" ");
  parts[1] = side;
  parts[3] = "-";
  return targetsOf(parts.join(" "), square);
}

/** The position with a move applied, for showing your move before the server confirms it. */
function after(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen);
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return c.fen();
  } catch {
    return null;
  }
}

const isPromotion = (fen: string, from: string, to: string) => {
  const p = piecesOf(fen).get(from);
  return p?.[1] === "P" && (to[1] === "8" || to[1] === "1");
};

/** A toolbar button: icon above a short label, so four fit across a 360 px phone. */
function ToolButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-control border border-line bg-surface text-xs font-semibold text-ink transition-colors duration-(--dur-press) hover:bg-surface-2 active:scale-[0.97] disabled:opacity-40"
    >
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  );
}

/** Opponent above the board, you below; moves, then the buttons (decided with Best, Oct 2026). */
export default function ChessTable({ snap, send }: Props) {
  const offset = useRoom((s) => s.offset);
  const pending = useRoom((s) => s.pending);
  const connection = useRoom((s) => s.connection);
  const view = snap.view as ChessView;
  const rules = snap.room.rules as ChessRules;
  const you = view.you;
  const ended = snap.room.phase === "ended" || !!view.result;
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [premove, setPremove] = useState<readonly [string, string] | null>(null);
  const [promo, setPromo] = useState<Promo | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [typedHint, setTypedHint] = useState<string | null>(null);
  const [resigning, setResigning] = useState(false);
  const turnSeenAt = useRef(0);
  const feed = useChessFeed(you);

  const whiteSeat = seatOf(view, "w");
  const blackSeat = seatOf(view, "b");
  const toMove = sideToMove(view.fen);
  const myTurn = !!you && !ended && toMove === you;
  const ready = connection === "open" && pending === null;
  const ply = view.moves.length;

  // Your move shows at once; the server's snapshot replaces it.
  const pendingMove = pending?.action as ChessAction | undefined;
  const shownFen =
    viewing !== null
      ? (view.history[viewing] ?? view.fen)
      : pendingMove?.type === "move"
        ? (after(view.fen, pendingMove.uci) ?? view.fen)
        : view.fen;
  const lastMove =
    viewing !== null
      ? (view.moves[viewing - 1] ?? null)
      : pendingMove?.type === "move"
        ? pendingMove.uci
        : (view.moves.at(-1) ?? null);
  const shown = new Chess(shownFen);
  const shownPieces = piecesOf(shownFen);
  const checkSquare = shown.inCheck()
    ? ([...piecesOf(shownFen)].find(([, p]) => p === `${sideToMove(shownFen)}K`)?.[0] ?? null)
    : null;

  // Think time is measured from when the position reached this phone.
  useEffect(() => {
    if (myTurn) turnSeenAt.current = Date.now();
  }, [myTurn, view.fen]);

  function act(action: ChessAction) {
    const id = crypto.randomUUID();
    useRoom.setState({ pending: { id, action } });
    send({ t: "act", id, v: snap.v, a: action });
  }

  function playMove(from: string, to: string, promotion?: string, isPremove = false) {
    const uci = `${from}${to}${promotion ?? ""}`;
    setSelected(null);
    if (isPremove) {
      setPremove([from, to]);
      return;
    }
    act({ type: "move", uci, mt: Math.max(0, Date.now() - turnSeenAt.current) });
  }

  function tryMove(from: string, to: string) {
    const premoving = !myTurn;
    const legal = premoving
      ? premoveTargets(view.fen, from, you as Side)
      : targetsOf(view.fen, from);
    if (!legal.includes(to)) return false;
    if (isPromotion(view.fen, from, to)) {
      if (premoving && rules.autoQueenPremove) playMove(from, to, "q", true);
      else setPromo({ from, to, premove: premoving });
    } else playMove(from, to, undefined, premoving);
    return true;
  }

  // Premove: when the snapshot that gives you the move arrives, play it if it's legal there
  // (free on the clock: mt 0). Done in the store subscription, not an effect, so it's sent
  // straight away and only once.
  const premoveRef = useRef(premove);
  const sendRef = useRef(send);
  useEffect(() => {
    premoveRef.current = premove;
    sendRef.current = send;
  }, [premove, send]);
  useEffect(
    () =>
      useRoom.subscribe((s, prev) => {
        const pm = premoveRef.current;
        if (!pm || !s.snap || s.snap === prev.snap) return;
        const v = s.snap.view as ChessView | null;
        if (!v || v.result || !v.you || sideToMove(v.fen) !== v.you) return;
        premoveRef.current = null;
        setPremove(null);
        const [from, to] = pm;
        if (!targetsOf(v.fen, from).includes(to)) return;
        const action: ChessAction = {
          type: "move",
          uci: `${from}${to}${isPromotion(v.fen, from, to) ? "q" : ""}`,
          mt: 0,
        };
        const id = crypto.randomUUID();
        useRoom.setState({ pending: { id, action } });
        sendRef.current({ t: "act", id, v: s.snap.v, a: action });
      }),
    [],
  );

  // Keyboards: ← and → step through the moves (not while typing a move).
  const sanCount = view.san.length;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement | null)?.closest("input, textarea")) return;
      if (e.key === "ArrowLeft") setViewing((v) => Math.max(0, (v ?? sanCount) - 1));
      else if (e.key === "ArrowRight")
        setViewing((v) => (v === null || v + 1 >= sanCount ? null : v + 1));
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sanCount]);

  function submitTyped() {
    const m = parseTypedMove(view.fen, typed);
    if (!myTurn) return setTypedHint("Wait for your turn");
    if (!m) return setTypedHint(`"${typed.trim()}" isn't a legal move here`);
    setTyped("");
    setTypedHint(null);
    setViewing(null);
    playMove(m.from, m.to, m.promotion);
  }

  async function copyPosition() {
    try {
      await navigator.clipboard.writeText(shownFen);
      setTypedHint("Position copied (FEN)");
    } catch {
      setTypedHint(shownFen);
    }
  }

  const canMoveNow = myTurn && ready && viewing === null;
  const canPremove = !!you && !ended && !myTurn && rules.premoves && viewing === null;
  const mine = (sq: string) => piecesOf(view.fen).get(sq)?.[0] === you;

  function tap(sq: string) {
    if (!canMoveNow && !canPremove) return;
    if (premove) setPremove(null);
    if (selected && selected !== sq && tryMove(selected, sq)) return;
    setSelected(mine(sq) && selected !== sq ? sq : null);
  }

  const targets = !selected
    ? []
    : canMoveNow
      ? targetsOf(view.fen, selected)
      : canPremove
        ? premoveTargets(view.fen, selected, you as Side)
        : [];

  // Clocks, on server time.
  const running = !ended && ply >= 2 && !!view.clock;
  const now = useNow(running, 100) + offset;
  const clockOf = (side: Side) => {
    const ms = clockShows(view, side, now);
    return ms === null ? null : { ms, running: running && toMove === side };
  };
  // A soft tick each second when your own clock is under 10 s.
  const myMs = you ? clockOf(you) : null;
  const tickSecond = myMs?.running && myMs.ms < 10_000 ? Math.ceil(myMs.ms / 1000) : null;
  useEffect(() => {
    if (tickSecond !== null && useRoom.getState().soundOn) sfx.tick();
  }, [tickSecond]);

  const mat = material(view.fen);
  const bottomSide: Side = flipped ? other(you ?? "w") : (you ?? "w");
  const topSide = other(bottomSide);
  const card = (side: Side) => {
    const seat = side === "w" ? whiteSeat : blackSeat;
    const info = snap.seats[seat];
    if (!info) return null;
    return (
      <PlayerCard
        seat={info}
        isYou={side === you}
        colour={side}
        captured={mat.captured[side]}
        lead={mat.lead[side]}
        clock={clockOf(side)}
        toMove={!ended && toMove === side}
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
    view.moves.length >= (you === "w" ? 1 : 2);
  const canClaim =
    !!you &&
    !ended &&
    rules.drawClaims === "claim" &&
    (repetitions(view) >= 3 || halfmoveClock(view.fen) >= 100);

  const status = ended
    ? null
    : ply < 2 && myTurn
      ? "Your move. Make it within 30 s or the game is aborted"
      : myTurn
        ? "Your move"
        : `${seatName(snap.seats, toMove === "w" ? whiteSeat : blackSeat)} to move`;
  const lastSan = view.san.at(-1);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-2 px-3 py-3">
      {card(topSide)}

      {/* Capped by screen height so the buttons stay on a 360 × 640 phone. */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-card border border-line shadow-sm"
        style={{ maxWidth: "max(16rem, calc(100dvh - 23rem))" }}
      >
        <ChessBoard
          fen={shownFen}
          orientation={bottomSide}
          lastMove={lastMove}
          check={checkSquare}
          selected={selected}
          targets={targets}
          premove={premove}
          canPick={(sq) => (canMoveNow || canPremove) && mine(sq)}
          onTap={tap}
          onDrop={(from, to) => {
            if (!(canMoveNow || canPremove) || !tryMove(from, to)) setSelected(null);
          }}
        />
        {promo ? (
          <div
            className="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-card border border-line bg-surface p-3 shadow-lg"
            role="dialog"
            aria-label="Promote to"
          >
            <p className="mb-2 text-center text-sm font-semibold">Promote to</p>
            <div className="flex gap-2">
              {(["q", "r", "b", "n"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={pieceName(`${you}${p.toUpperCase()}`).split(" ")[1]}
                  onClick={() => {
                    setPromo(null);
                    playMove(promo.from, promo.to, p, promo.premove);
                  }}
                  className="size-14 rounded-control border border-line bg-[#F2E6D0] hover:border-ink-3"
                >
                  <svg viewBox="0 0 45 45" className="size-full" aria-hidden="true">
                    <use href={`#cp-${you}${p.toUpperCase()}`} />
                  </svg>
                </button>
              ))}
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => setPromo(null)}
                className="flex size-14 items-center justify-center text-ink-2"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {card(bottomSide)}

      {/* The board as buttons, for screen readers, keyboards (and tests). */}
      <div className="sr-only" role="group" aria-label="Board squares">
        {[...Array(64)].map((_, i) => {
          const sq = `${FILES[i % 8]}${8 - Math.floor(i / 8)}`;
          const p = shownPieces.get(sq);
          return (
            <button key={sq} type="button" onClick={() => tap(sq)}>
              {`${sq}, ${p ? pieceName(p) : "empty"}${targets.includes(sq) ? ", can move here" : ""}`}
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {lastSan ? `${ply % 2 ? "White" : "Black"}: ${lastSan}` : ""}
      </p>

      <MoveStrip san={view.san} viewing={viewing} onView={setViewing} />
      {/* Says when time is added per move (Best, Oct 2026: a 5+3 clock looked like it reset). */}
      <p className="-mt-1 text-center text-xs text-ink-3">{timeControlText(rules)}</p>

      {offerFromThem ? (
        <div className="flex items-center gap-2 rounded-control bg-accent-soft px-3 py-2 text-sm font-semibold">
          <span className="flex-1">
            {seatName(snap.seats, seatOf(view, opp as Side))} offers a draw
          </span>
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
            {seatName(snap.seats, seatOf(view, opp as Side))} wants to take back
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
          {feed ?? status ?? ""}
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
          ) : canClaim ? (
            <ToolButton
              icon={<Handshake size={18} />}
              label="Claim draw"
              onClick={() => act({ type: "claim_draw" })}
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
              setTypedHint(null);
            }}
            aria-label="Type a move"
            placeholder="Type a move: e4, Nf3, O-O"
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
        {typedHint ? (
          <p className="w-full truncate text-xs text-ink-2" aria-live="polite">
            {typedHint}
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
        <ChessResult
          view={view}
          seats={snap.seats}
          rules={rules}
          white={whiteSeat}
          black={blackSeat}
          onRematch={() => send({ t: "rematch" })}
        />
      ) : null}
    </div>
  );
}
