import type { ReactNode } from "react";
import { cx } from "../cx";

type AlertProps = {
  tone?: "error" | "info" | "success";
  title?: ReactNode;
  children: ReactNode;
  className?: string;
};

const tones = {
  error: "border-danger/40 bg-danger-soft",
  info: "border-line bg-surface-2",
  success: "border-brand/30 bg-brand-soft",
};

export function Alert({ tone = "error", title, children, className }: AlertProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("rounded-control border px-4 py-3 text-sm text-ink", tones[tone], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-0.5 text-ink-2" : undefined}>{children}</div>
    </div>
  );
}
