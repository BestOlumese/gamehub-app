import type { ReactNode } from "react";
import { ArtImage, type ArtName } from "@/components/site/art-image";

/** Nothing here yet: a drawing, one line, and what to do about it. */
export function EmptyState({
  art,
  title,
  children,
}: {
  art: ArtName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-card border-2 border-dashed border-line-edge bg-paper-2/60 px-5 py-7 text-center">
      <ArtImage name={art} className="mx-auto h-20 w-auto -rotate-3 opacity-90" lazy />
      <p className="mt-3 font-display text-lg font-bold">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-xs text-sm text-ink-2">{children}</div> : null}
    </div>
  );
}
