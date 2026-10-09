"use client";

import {
  firstTurn,
  pdnMoves,
  timeLabel,
  type DraughtsEndReason,
  type DraughtsRules,
  type DraughtsView,
} from "@gamehub/engine/draughts";
import type { SeatPublic } from "@gamehub/protocol";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DRAUGHTS_COLOUR, draughtsVariantName } from "@/lib/game-meta";
import { seatName } from "../rps/names";

const REASON: Record<DraughtsEndReason, string> = {
  no_pieces: "by taking every seed",
  blocked: "Their seeds had no move left",
  resign: "by resignation",
  timeout: "on time",
  threefold: "The same position three times",
  no_progress: "Too many moves with no capture or man move",
  endgame: "A lone king held out long enough",
  kings: "One king each: nobody can win",
  agreement: "Draw agreed",
  aborted: "Game aborted",
};
const WIN_REASONS: ReadonlySet<DraughtsEndReason> = new Set(["no_pieces", "resign", "timeout"]);

/** PDN with our tags, for copying into a draughts program. Light (red) plays the White side. */
export function pdnOf(view: DraughtsView, seats: SeatPublic[], light: number, dark: number) {
  const r = view.result;
  const naija = view.variant === "naija10";
  const result = !r
    ? "*"
    : r.winner === "light"
      ? naija
        ? "2-0"
        : "1-0"
      : r.winner === "dark"
        ? naija
          ? "0-2"
          : "0-1"
        : naija
          ? "1-1"
          : "1/2-1/2";
  const date = new Date(view.startedAt).toISOString().slice(0, 10).replaceAll("-", ".");
  const tags = [
    ["Event", "GameHub"],
    ["Site", "https://gamehub-apps.vercel.app"],
    ["Date", date],
    ["White", seatName(seats, light)],
    ["Black", seatName(seats, dark)],
    ["Result", result],
    ["GameType", naija ? "20" : "21"],
  ];
  return `${tags.map(([k, v]) => `[${k} "${String(v).replaceAll('"', "'")}"]`).join("\n")}\n\n${pdnMoves(view.moves, firstTurn(view))} ${result}\n`;
}

type Props = {
  view: DraughtsView;
  seats: SeatPublic[];
  rules: DraughtsRules;
  light: number;
  dark: number;
  onRematch: () => void;
};

/** Slides up when the game ends: who won and how, rematch, the game as PDN. */
export function DraughtsResult({ view, seats, rules, light, dark, onRematch }: Props) {
  const [copied, setCopied] = useState(false);
  const r = view.result;
  if (!r) return null;
  const winnerSeat = r.winner === "light" ? light : r.winner === "dark" ? dark : null;
  const title =
    winnerSeat === null
      ? "Draw"
      : r.winner === view.you
        ? "You won!"
        : `${seatName(seats, winnerSeat)} won`;
  const how =
    winnerSeat === null || !r.winner
      ? REASON[r.reason]
      : WIN_REASONS.has(r.reason)
        ? `${DRAUGHTS_COLOUR[r.winner]} wins ${REASON[r.reason]}`
        : REASON[r.reason];

  async function copy() {
    try {
      await navigator.clipboard.writeText(pdnOf(view, seats, light, dark));
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
        aria-labelledby="draughts-result"
        className="mx-auto max-w-md rounded-card border border-line bg-surface p-6 shadow-lg transition-[translate,opacity] duration-(--dur-sheet) ease-standard starting:translate-y-full starting:opacity-0"
      >
        <h2
          id="draughts-result"
          className="text-center font-display text-2xl font-extrabold tracking-tight"
        >
          {title}
        </h2>
        <p className="mt-1 text-center text-ink-2">{how}</p>
        <p className="mt-1 text-center text-sm text-ink-3">
          {Math.ceil(view.moves.length / 2)} moves · {draughtsVariantName(view)} ·{" "}
          {timeLabel(rules.timeControl)}
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
            {copied ? "Copied" : "Copy game (PDN)"}
          </Button>
          <Link href="/home" className={buttonClasses("ghost", "lg", "w-full")}>
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
