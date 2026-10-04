import { Check } from "lucide-react";

export function StatusPill({ on, children }: { on: boolean; children: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        on ? "bg-brand-soft text-brand-strong" : "bg-surface-2 text-ink-2"
      }`}
    >
      {on ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
