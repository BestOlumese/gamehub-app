"use client";

import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";

/** Room (or tournament) code + WhatsApp / copy / native share. */
export function SharePanel({
  code,
  gameName,
  kind = "room",
  tone = "trophy",
}: {
  code: string;
  /** Rooms: the game. Tournaments: the tournament's name. */
  gameName: string;
  kind?: "room" | "tournament";
  /** The game (rooms) or "trophy" (tournaments): colours the code's panel. */
  tone?: string;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const path = `/${kind === "room" ? "r" : "t"}/${code}`;
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const text =
    kind === "room"
      ? `Join my ${gameName} game on GameHub. Room code ${code}: ${url}`
      : `Join my tournament "${gameName}" on GameHub. Code ${code}: ${url}`;
  const label = kind === "room" ? "Room code" : "Tournament code";

  async function copy(what: "link" | "code") {
    try {
      await navigator.clipboard.writeText(what === "link" ? url : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard blocked: the code is on screen anyway
    }
  }

  return (
    <div className={`tone-${tone} tile overflow-hidden text-center`}>
      <div className="relative border-b-4 border-(--g) bg-(--g-soft) px-4 pt-4 pb-3">
        <span aria-hidden="true" className="pat absolute inset-0" />
        <p className="eyebrow relative">{label}</p>
        {/* Each letter on its own tile, like pieces on the table. Tap to copy. */}
        <button
          type="button"
          onClick={() => copy("code")}
          className="relative mt-2 inline-flex gap-1.5 rounded-control p-1 sm:gap-2"
          aria-label={`${label} ${code.split("").join(" ")}. Tap to copy.`}
        >
          {code.split("").map((ch, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="grid h-12 w-10 place-items-center rounded-[8px] border border-line bg-surface font-display text-3xl font-extrabold shadow-[0_3px_0_var(--color-line-edge)] sm:h-14 sm:w-12 sm:text-4xl"
            >
              {ch}
            </span>
          ))}
        </button>
        <p className="relative mt-1 h-5 text-sm font-semibold text-(--g)" aria-live="polite">
          {copied === "code" ? "Code copied" : copied === "link" ? "Link copied" : ""}
        </p>
      </div>
      <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses("primary", "lg")}
        >
          <Share2 size={18} aria-hidden="true" />
          Share on WhatsApp
        </a>
        <Button variant="secondary" onClick={() => copy("link")}>
          {copied === "link" ? (
            <Check size={18} aria-hidden="true" />
          ) : (
            <Copy size={18} aria-hidden="true" />
          )}
          Copy link
        </Button>
      </div>
    </div>
  );
}
