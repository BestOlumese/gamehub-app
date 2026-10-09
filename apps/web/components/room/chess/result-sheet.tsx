"use client";

import {
  timeLabel,
  type ChessEndReason,
  type ChessRules,
  type ChessView,
} from "@gamehub/engine/chess";
import type { SeatPublic } from "@gamehub/protocol";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { seatName } from "../rps/names";

const REASON: Record<ChessEndReason, string> = {
  checkmate: "by checkmate",
  resign: "by resignation",
  timeout: "on time",
  timeout_vs_insufficient: "Time ran out, but there was no way left to mate",
  stalemate: "Stalemate: no legal move, but no check",
  insufficient: "Not enough pieces left to mate",
  threefold: "The same position three times",
  fivefold: "The same position five times",
  fifty: "50 moves with no capture or pawn move",
  seventyfive: "75 moves with no capture or pawn move",
  agreement: "Draw agreed",
  aborted: "Game aborted",
};

/** PGN with our tags, for copying into any chess app. */
export function pgnOf(
  view: ChessView,
  seats: SeatPublic[],
  rules: ChessRules,
  white: number,
  black: number,
) {
  const r = view.result;
  const result = !r ? "*" : r.winner === "w" ? "1-0" : r.winner === "b" ? "0-1" : "1/2-1/2";
  const date = new Date(view.startedAt).toISOString().slice(0, 10).replaceAll("-", ".");
  const tc = rules.timeControl
    ? `${rules.timeControl.baseSeconds}+${rules.timeControl.incrementSeconds}`
    : "-";
  const tags = [
    ["Event", "GameHub"],
    ["Site", "https://gamehub-apps.vercel.app"],
    ["Date", date],
    ["White", seatName(seats, white)],
    ["Black", seatName(seats, black)],
    ["Result", result],
    ["TimeControl", tc],
    ["Termination", r ? (r.reason === "timeout" ? "Time forfeit" : "Normal") : "Unterminated"],
  ];
  const moves = view.san.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(" ");
  return `${tags.map(([k, v]) => `[${k} "${String(v).replaceAll('"', "'")}"]`).join("\n")}\n\n${moves} ${result}\n`;
}

type Props = {
  view: ChessView;
  seats: SeatPublic[];
  rules: ChessRules;
  white: number;
  black: number;
  onRematch: () => void;
};

/** Slides up when the game ends: who won and how, rematch, the game as PGN. */
export function ChessResult({ view, seats, rules, white, black, onRematch }: Props) {
  const [copied, setCopied] = useState(false);
  const r = view.result;
  if (!r) return null;
  const winnerSeat = r.winner === "w" ? white : r.winner === "b" ? black : null;
  const title =
    winnerSeat === null
      ? "Draw"
      : r.winner === view.you
        ? "You won!"
        : `${seatName(seats, winnerSeat)} won`;
  const how =
    winnerSeat === null
      ? REASON[r.reason]
      : `${r.winner === "w" ? "White" : "Black"} wins ${REASON[r.reason]}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(pgnOf(view, seats, rules, white, black));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: nothing else to do.
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:pb-8">
      <div
        role="dialog"
        aria-labelledby="chess-result"
        className="mx-auto max-w-md rounded-card border border-line bg-surface p-6 shadow-lg transition-[translate,opacity] duration-(--dur-sheet) ease-standard starting:translate-y-full starting:opacity-0"
      >
        <h2
          id="chess-result"
          className="text-center font-display text-2xl font-extrabold tracking-tight"
        >
          {title}
        </h2>
        <p className="mt-1 text-center text-ink-2">{how}</p>
        <p className="mt-1 text-center text-sm text-ink-3">
          {Math.ceil(view.san.length / 2)} moves · {timeLabel(rules.timeControl)}
        </p>
        <div className="mt-6 grid gap-2">
          {view.you ? (
            <Button block onClick={onRematch}>
              Rematch
            </Button>
          ) : null}
          <Button variant="secondary" block onClick={copy}>
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy game (PGN)"}
          </Button>
          <Link href="/home" className={buttonClasses("ghost", "lg", "w-full")}>
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
