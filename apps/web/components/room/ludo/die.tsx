"use client";

import { useEffect, useState } from "react";

const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[20, 20]],
  2: [
    [11, 11],
    [29, 29],
  ],
  3: [
    [11, 11],
    [20, 20],
    [29, 29],
  ],
  4: [
    [11, 11],
    [29, 11],
    [11, 29],
    [29, 29],
  ],
  5: [
    [11, 11],
    [29, 11],
    [20, 20],
    [11, 29],
    [29, 29],
  ],
  6: [
    [11, 10],
    [29, 10],
    [11, 20],
    [29, 20],
    [11, 30],
    [29, 30],
  ],
};

export const ROLL_MS = 600;

type Props = {
  value: number | null;
  /** Changes on every roll; the die tumbles for ROLL_MS, then shows `value`. */
  rollKey: number;
  colour: string;
  canRoll: boolean;
  onRoll: () => void;
};

/** The die in the playing seat's panel. Yours is a big button when it's time to roll. */
export function Die({ value, rollKey, colour, canRoll, onRoll }: Props) {
  const [tumble, setTumble] = useState<number | null>(null);

  useEffect(() => {
    if (!rollKey || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const faces = setInterval(() => setTumble(1 + Math.floor(Math.random() * 6)), 70);
    const stop = setTimeout(() => {
      clearInterval(faces);
      setTumble(null);
    }, ROLL_MS);
    return () => {
      clearInterval(faces);
      clearTimeout(stop);
    };
  }, [rollKey]);

  const face = tumble ?? value;
  const svg = (
    <svg
      viewBox="0 0 40 40"
      width="44"
      height="44"
      aria-hidden="true"
      className={tumble !== null ? "motion-safe:animate-spin" : ""}
      style={tumble !== null ? { animationDuration: "300ms" } : undefined}
    >
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="9"
        fill="#fff"
        stroke={colour}
        strokeWidth="2.5"
      />
      {(face ? (PIPS[face] ?? []) : []).map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.6" fill="#1A1C20" />
      ))}
    </svg>
  );

  if (!canRoll) {
    return (
      <span className="block" role="img" aria-label={face ? `Die shows ${face}` : "Die"}>
        {svg}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onRoll}
      aria-label="Roll the die"
      className="relative rounded-[12px] shadow-sm transition-transform duration-(--dur-press) active:scale-90"
    >
      <span
        className="absolute -inset-1 rounded-[14px] border-2 border-accent motion-safe:animate-pulse"
        aria-hidden="true"
      />
      {svg}
    </button>
  );
}
