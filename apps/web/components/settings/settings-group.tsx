import type { ReactNode } from "react";

/** A titled card of rows, iOS-settings style. */
export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      {title ? <h3 className="mb-2 px-1 text-sm font-semibold text-ink-2">{title}</h3> : null}
      <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-sm">
        {children}
      </div>
    </section>
  );
}
