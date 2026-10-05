"use client";

import { useEffect, useState } from "react";

/** Re-renders every `ms` while `active`; returns Date.now(). */
export function useNow(active: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // Catch up at once: the stored time may be from long before this became active
    // (a seat chip mounted turns ago would otherwise show a too-long countdown for a second).
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [active, ms]);
  return now;
}

export const mmss = (msLeft: number) => {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
