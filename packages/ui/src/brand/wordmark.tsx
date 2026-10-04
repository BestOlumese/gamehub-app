import type { HTMLAttributes } from "react";

/** "Game" in ink, "Hub" in brand green, Bricolage Grotesque 800. */
export function Wordmark({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={["font-display font-extrabold tracking-tight", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <span className="text-ink">Game</span>
      <span className="text-brand">Hub</span>
    </span>
  );
}
