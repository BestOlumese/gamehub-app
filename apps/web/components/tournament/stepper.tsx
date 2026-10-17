"use client";

import { Minus, Plus } from "lucide-react";
import { useId } from "react";

/** A labelled number with − and + (keyboard: the buttons; screen readers hear the value). */
export function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const btn =
    "grid size-11 place-items-center rounded-control border border-line bg-surface text-ink transition-colors duration-(--dur-press) hover:border-ink-3 disabled:opacity-35";
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p id={`${id}-l`} className="font-semibold">
          {label}
        </p>
        {hint ? <p className="text-sm text-ink-2">{hint}</p> : null}
      </div>
      <div className="flex items-center gap-2" role="group" aria-labelledby={`${id}-l`}>
        <button
          type="button"
          className={btn}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          aria-label={`${label}: fewer`}
        >
          <Minus size={18} aria-hidden="true" />
        </button>
        <output
          aria-live="polite"
          className="w-9 text-center font-display text-xl font-extrabold tabular-nums"
        >
          {value}
        </output>
        <button
          type="button"
          className={btn}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          aria-label={`${label}: more`}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
