import type { ReactNode } from "react";

export function SettingsCard({
  title,
  description,
  tone = "default",
  children,
}: {
  title: string;
  description?: ReactNode;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-card border bg-surface p-6 shadow-sm ${tone === "danger" ? "border-danger/40" : "border-line"}`}
    >
      <h2 className="text-lg font-bold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-ink-2">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
