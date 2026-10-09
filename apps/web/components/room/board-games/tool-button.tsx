"use client";

import type { ReactNode } from "react";

/** A toolbar button: icon above a short label, so four fit across a 360 px phone. */
export function ToolButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-control border border-line bg-surface text-xs font-semibold text-ink transition-colors duration-(--dur-press) hover:bg-surface-2 active:scale-[0.97] disabled:opacity-40"
    >
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  );
}
