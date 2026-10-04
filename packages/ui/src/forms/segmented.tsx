"use client";

import { useId } from "react";

type Option<T extends string | number> = { value: T; label: string };

type SegmentedProps<T extends string | number> = {
  label: string;
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange: (value: T) => void;
};

/** A row of mutually exclusive choices (native radios, so keyboard and screen readers just work). */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex rounded-control border border-line bg-surface-2 p-1">
        {options.map((o) => (
          <label
            key={String(o.value)}
            className="relative flex-1 cursor-pointer rounded-[7px] px-2 py-2 text-center text-sm font-semibold text-ink-2 transition-colors duration-(--dur-press) has-checked:bg-surface has-checked:text-ink has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-brand"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
