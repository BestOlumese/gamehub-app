"use client";

import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";

/** Room code + WhatsApp / copy / native share. */
export function SharePanel({ code, gameName }: { code: string; gameName: string }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const url = typeof window === "undefined" ? `/r/${code}` : `${window.location.origin}/r/${code}`;
  const text = `Join my ${gameName} game on GameHub. Room code ${code}: ${url}`;

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
      <p className="text-sm font-semibold text-ink-2">Room code</p>
      <button
        type="button"
        onClick={() => copy("code")}
        className="mt-1 rounded-control px-2 font-display text-4xl font-extrabold tracking-[0.25em] tabular-nums hover:bg-surface-2 sm:text-5xl"
        aria-label={`Room code ${code.split("").join(" ")}. Tap to copy.`}
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
