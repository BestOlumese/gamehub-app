"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __turnstileLoad?: Promise<void>;
  }
}

// Cloudflare's always-pass test key, used when no real key is configured (dev, E2E).
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile(): Promise<void> {
  window.__turnstileLoad ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      window.__turnstileLoad = undefined;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return window.__turnstileLoad;
}

type TurnstileProps = {
  action: string;
  onToken: (token: string | null) => void;
  /** Change to get a fresh token (tokens are single-use). */
  resetKey?: number;
};

/** Cloudflare Turnstile. Usually invisible; shows a checkbox only when it needs one. */
export function Turnstile({ action, onToken, resetKey = 0 }: TurnstileProps) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const tokenCb = useRef(onToken);

  useEffect(() => {
    tokenCb.current = onToken;
  });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile || widget.current) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          action,
          theme: "light",
          size: "flexible",
          appearance: "interaction-only",
          callback: (t: string) => tokenCb.current(t),
          "expired-callback": () => tokenCb.current(null),
          "error-callback": () => tokenCb.current(null),
        });
      })
      .catch(() => tokenCb.current(null));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [action]);

  useEffect(() => {
    if (resetKey > 0 && widget.current && window.turnstile) {
      tokenCb.current(null);
      window.turnstile.reset(widget.current);
    }
  }, [resetKey]);

  return <div ref={box} className="empty:hidden" />;
}
