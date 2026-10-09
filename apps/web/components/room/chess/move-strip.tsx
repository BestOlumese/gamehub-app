"use client";

import { useEffect, useRef } from "react";

type Props = {
  san: readonly string[];
  /** Ply being looked at (null = the live position). */
  viewing: number | null;
  onView: (ply: number | null) => void;
};

/** One line of moves under your card, newest on the right; tap one to look back at it. */
export function MoveStrip({ san, viewing, onView }: Props) {
  const strip = useRef<HTMLOListElement>(null);
  const current = viewing ?? san.length;
  useEffect(() => {
    strip.current
      ?.querySelector(`[data-ply="${current}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current, san.length]);

  if (!san.length)
    return <p className="h-9 text-center text-sm leading-9 text-ink-3">No moves yet</p>;
  return (
    <div className="flex items-center gap-2">
      <ol
        ref={strip}
        className="flex h-9 min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm whitespace-nowrap [scrollbar-width:none]"
        aria-label="Moves"
      >
        {san.map((m, i) => {
          const ply = i + 1;
          const on = ply === current;
          return (
            <li key={i} className="flex items-center">
              {i % 2 === 0 ? (
                <span className="px-1 text-ink-3 tabular-nums">{i / 2 + 1}.</span>
              ) : null}
              <button
                type="button"
                data-ply={ply}
                aria-current={on ? "step" : undefined}
                onClick={() => onView(ply === san.length ? null : ply)}
                className={`rounded px-1.5 py-0.5 font-semibold ${on ? "bg-accent text-ink" : "text-ink-2 hover:bg-surface-2"}`}
              >
                {m}
              </button>
            </li>
          );
        })}
      </ol>
      {viewing !== null ? (
        <button
          type="button"
          onClick={() => onView(null)}
          className="shrink-0 rounded-full bg-brand px-3 py-1 text-xs font-bold text-white"
        >
          Back to game
        </button>
      ) : null}
    </div>
  );
}
