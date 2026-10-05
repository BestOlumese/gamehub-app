"use client";

import { useState } from "react";

/**
 * A ring that empties over the turn. Pure CSS: the animation starts part-way
 * through (negative delay) so it matches the server deadline.
 */
export function TimerRing({
  endsAt,
  totalMs,
  offset,
  size,
}: {
  endsAt: number;
  totalMs: number;
  offset: number;
  size: number;
}) {
  // Read the clock once when the ring appears (it's re-mounted per deadline via `key`).
  const [mountedAt] = useState(() => Date.now());
  const remaining = Math.max(0, endsAt - (mountedAt + offset));
  // The clock may start a moment in the future (pause after an RPS reveal): never negative.
  const elapsed = Math.max(0, totalMs - remaining);
  const low = remaining < 5000;
  return (
    <svg
      viewBox="0 0 36 36"
      width={size}
      height={size}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -rotate-90"
    >
      <circle cx="18" cy="18" r="16.5" fill="none" stroke="var(--color-line)" strokeWidth="2" />
      <circle
        cx="18"
        cy="18"
        r="16.5"
        fill="none"
        stroke={low ? "var(--color-danger)" : "var(--color-accent)"}
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100"
        style={{
          animation: `ring-deplete ${totalMs}ms linear both`,
          animationDelay: `-${elapsed}ms`,
        }}
      />
    </svg>
  );
}

/** A bot's turn: no clock, just a spinning arc so you can see who's playing. */
export function ThinkingRing({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 36 36"
      width={size}
      height={size}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 motion-safe:animate-spin"
    >
      <circle cx="18" cy="18" r="16.5" fill="none" stroke="var(--color-line)" strokeWidth="2" />
      <circle
        cx="18"
        cy="18"
        r="16.5"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="30 70"
      />
    </svg>
  );
}
