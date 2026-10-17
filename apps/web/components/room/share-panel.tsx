"use client";

import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";

/** Room (or tournament) code + WhatsApp / copy / native share. */
export function SharePanel({
  code,
  gameName,
  kind = "room",
}: {
  code: string;
  /** Rooms: the game. Tournaments: the tournament's name. */
  gameName: string;
  kind?: "room" | "tournament";
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
    <div className="rounded-card border border-line bg-surface p-5 text-center shadow-sm sm:p-6">
      <p className="text-sm font-semibold text-ink-2">{label}</p>
      <button
        type="button"
        onClick={() => copy("code")}
        className={`mt-1 rounded-control px-2 font-display font-extrabold tabular-nums hover:bg-surface-2 ${kind === "room" ? "text-4xl tracking-[0.25em] sm:text-5xl" : "text-3xl tracking-[0.15em] sm:text-5xl sm:tracking-[0.2em]"}`}
        aria-label={`${label} ${code.split("").join(" ")}. Tap to copy.`}
      >
        {code}
      </button>
      <p className="mt-1 h-5 text-sm text-brand" aria-live="polite">
        {copied === "code" ? "Code copied" : copied === "link" ? "Link copied" : ""}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
