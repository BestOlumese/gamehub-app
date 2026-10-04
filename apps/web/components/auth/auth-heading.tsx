import type { ReactNode } from "react";

export function AuthHeading({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="font-display text-2xl leading-[1.15] font-extrabold tracking-tight">
        {title}
      </h1>
      {sub ? <p className="mt-2 text-ink-2">{sub}</p> : null}
    </div>
  );
}
