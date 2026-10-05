"use client";

import type { Throw } from "@gamehub/engine/rps";
import { ThrowArt } from "@gamehub/ui/art/throw-art";
import { LogoMark } from "@gamehub/ui/brand/logo-mark";

export const THROW_LABEL: Record<Throw, string> = {
  rock: "Rock",
  paper: "Paper",
  scissors: "Scissors",
};

type Props = {
  /** Shown face-up when set; face-down (card back) otherwise. */
  pick: Throw | null;
  outcome?: "win" | "lose" | "tie" | null;
  size?: "md" | "lg";
  label: string;
};

/** A card that flips between its back and a throw. Only transform and opacity animate. */
export function ThrowCard({ pick, outcome = null, size = "md", label }: Props) {
  const dims = size === "lg" ? "h-36 w-28" : "h-28 w-22";
  const faceUp = pick !== null;
  return (
    <div
      className={`relative ${dims} transition-[translate,opacity] duration-(--dur-card) ${outcome === "win" ? "-translate-y-2" : ""} ${outcome === "lose" ? "opacity-50" : ""}`}
      style={{ perspective: "600px" }}
      role="img"
      aria-label={faceUp ? `${label}: ${THROW_LABEL[pick]}` : `${label}: hidden`}
    >
      <div
        className="relative size-full transition-transform duration-(--dur-card) ease-standard"
        style={{ transformStyle: "preserve-3d", transform: faceUp ? "rotateY(180deg)" : "none" }}
      >
        {/* Back */}
        <div
          className="absolute inset-0 flex items-center justify-center rounded-card border-2 border-brand-strong bg-brand bg-ankara-brand"
          style={{ backfaceVisibility: "hidden" }}
        >
          <span className="rounded-control bg-brand p-2">
            <LogoMark className="size-8" />
          </span>
        </div>
        {/* Face */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-card border-2 bg-surface ${outcome === "win" ? "border-brand shadow-lg" : "border-line shadow-sm"}`}
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {pick ? (
            <>
              <ThrowArt pick={pick} className="size-3/5" />
              <span className="text-xs font-bold">{THROW_LABEL[pick]}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
