"use client";

import { Switch } from "@gamehub/ui/forms/switch";
import { Check, RotateCcw } from "lucide-react";
import { useId, type ReactNode } from "react";

/** A titled group of rule rows. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
        {title}
      </h3>
      <div className="divide-y divide-line rounded-card border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}

/** One on/off rule with a short explanation. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`flex items-center gap-4 px-4 py-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p id={`${id}-l`} className="font-semibold">
          {label}
        </p>
        <p id={`${id}-h`} className="text-sm text-ink-2">
          {hint}
        </p>
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        labelledBy={`${id}-l`}
        describedBy={`${id}-h`}
        disabled={disabled}
      />
    </div>
  );
}

/** "✓ Naija Standard", or "Custom rules" with a way back. */
export function PresetStrip({ standard, onReset }: { standard: boolean; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card bg-surface-2 px-4 py-3">
      {standard ? (
        <p className="flex items-center gap-2 font-semibold">
          <Check size={18} className="text-brand" aria-hidden="true" /> Naija Standard
        </p>
      ) : (
        <>
          <p className="font-semibold">Custom rules</p>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-sm font-semibold text-brand-strong hover:bg-brand-soft"
          >
            <RotateCcw size={15} aria-hidden="true" /> Reset to Naija Standard
          </button>
        </>
      )}
    </div>
  );
}
