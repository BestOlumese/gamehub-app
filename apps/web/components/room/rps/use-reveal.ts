"use client";

import type { Reveal } from "@gamehub/engine/rps";
import { useEffect, useRef, useState } from "react";

export const CHANT = ["Rock…", "Paper…", "Scissors…", "Shoot!"] as const;
const BEAT_MS = 230;
const SHOW_MS = 1400;

export type RevealPhase =
  | { kind: "idle" }
  | { kind: "chant"; beat: number; reveal: Reveal }
  | { kind: "show"; reveal: Reveal };

/**
 * Plays "Rock… Paper… Scissors… Shoot!" then holds the flipped cards whenever the
 * player's total number of revealed throws goes up. Counting across all their matches
 * means the deciding throw of a match still animates even though the same update also
 * moves them into their next match. Throws already revealed when the page opened are
 * never replayed.
 */
export function useReveal(
  totalThrows: number,
  latest: Reveal | undefined,
  reduceMotion: boolean,
): RevealPhase {
  const [phase, setPhase] = useState<RevealPhase>({ kind: "idle" });
  const seen = useRef(totalThrows);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // `latest` is a fresh object on every snapshot; depend on its content, not its identity.
  const latestJson = latest ? JSON.stringify(latest) : "";

  useEffect(() => {
    if (totalThrows <= seen.current || !latestJson) {
      seen.current = Math.max(seen.current, totalThrows);
      return;
    }
    seen.current = totalThrows;
    const reveal = JSON.parse(latestJson) as Reveal;
    timers.current.forEach(clearTimeout);
    const beats = reduceMotion ? [3] : [0, 1, 2, 3];
    timers.current = [
      ...beats.map((beat, i) =>
        setTimeout(() => setPhase({ kind: "chant", beat, reveal }), i * BEAT_MS),
      ),
      setTimeout(() => setPhase({ kind: "show", reveal }), beats.length * BEAT_MS),
      setTimeout(() => setPhase({ kind: "idle" }), beats.length * BEAT_MS + SHOW_MS),
    ];
  }, [totalThrows, latestJson, reduceMotion]);

  // Timers are only cancelled when the screen goes away, never mid-reveal.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return phase;
}
