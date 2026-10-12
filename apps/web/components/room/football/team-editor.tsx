"use client";

import {
  formation,
  type Card,
  type FootballAction,
  type SlotRef,
  type TeamSheet,
} from "@gamehub/engine/football";
import { useState } from "react";
import { teamNumbers } from "./draft-view";
import { sendChange } from "./live-changes";
import { Pitch } from "./pitch";

/**
 * Your team on the pitch with the bench under it: tap one, tap another to swap (design decision).
 * In a match, bench ↔ pitch is a substitution and counts against your subs.
 */
export function TeamEditor({
  sheet,
  cards,
  ready,
  act,
  subsLeft,
  off,
  live = false,
}: {
  /** In a match (not at a break): swaps wait out the server's change gap. */
  live?: boolean;
  sheet: TeamSheet;
  cards: Record<string, Card>;
  ready: boolean;
  act: (a: FootballAction) => void;
  /** In a match: subs you have left (null outside a match). */
  subsLeft: number | null;
  /** Sent-off players (can't move). */
  off?: readonly string[];
}) {
  const [first, setFirst] = useState<SlotRef | null>(null);
  const xi = Object.fromEntries(sheet.xi.map((x, i) => [i, x.id]));
  const { rating, chem, chemTotal } = teamNumbers({ formation: sheet.formation, xi }, cards);
  function tap(r: SlotRef) {
    if (!ready) return;
    if ("slot" in r && off?.includes(sheet.xi[r.slot]?.id ?? "")) return;
    if (!first) return setFirst(r);
    const same = JSON.stringify(first) === JSON.stringify(r);
    setFirst(null);
    if (same) return;
    if ("bench" in first && "bench" in r) return; // two subs: nothing to do
    if (subsLeft !== null && ("bench" in first || "bench" in r) && subsLeft <= 0) return;
    const a = first;
    sendChange(`swap:${JSON.stringify([a, r])}`, () => act({ type: "swap", a, b: r }), live);
  }
  const who = first
    ? "slot" in first
      ? cards[sheet.xi[first.slot]?.id ?? ""]?.short
      : cards[sheet.bench[first.bench] ?? ""]?.short
    : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-2 tabular-nums">
        {formation(sheet.formation).name} · Rating {rating} · Chemistry {chemTotal}/33
        {subsLeft !== null ? ` · ${subsLeft} sub${subsLeft === 1 ? "" : "s"} left` : ""}
      </p>
      <Pitch
        formationId={sheet.formation}
        xi={xi}
        cards={cards}
        chem={chem}
        selected={first && "slot" in first ? first.slot : null}
        onSlot={(slot) => tap({ slot })}
      />
      <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Bench">
        {sheet.bench.map((id, i) => {
          const c = cards[id];
          const sel = first && "bench" in first && first.bench === i;
          return (
            <button
              key={`${id}-${i}`}
              type="button"
              onClick={() => tap({ bench: i })}
              className={`flex shrink-0 flex-col items-center rounded-control border px-2 py-1 text-xs ${sel ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
            >
              <span className="font-bold tabular-nums">{c?.ovr}</span>
              <span className="max-w-16 truncate">{c?.short}</span>
              <span className="text-ink-3">{c?.positions[0]}</span>
            </button>
          );
        })}
      </div>
      <p className="min-h-5 text-sm font-semibold text-brand-strong" aria-live="polite">
        {who ? `Tap where ${who} should go` : ""}
      </p>
    </div>
  );
}
