import type { ReactNode } from "react";

/** A titled card of rows, iOS-settings style. */
export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      {title ? <h3 className="eyebrow mb-2 px-1">{title}</h3> : null}
      <div className="divide-y divide-line overflow-hidden tile">{children}</div>
    </section>
  );
}
