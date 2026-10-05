"use client";

import { parseCard, SHAPES } from "@gamehub/engine/whot";
import { useEffect, useRef, useState } from "react";
import { cardLabel, WhotCard } from "./whot-card";

const W = 64;
const H = (W * 88) / 60;
const LIFT = 6;
const order = (id: string) => {
  const c = parseCard(id);
  const s = c.shape === "whot" ? SHAPES.length : SHAPES.indexOf(c.shape);
  return s * 100 + c.n;
};

type Props = {
  hand: string[];
  playable: Set<string>;
  /** It's your move: playable cards lift, the rest dim. */
  active: boolean;
  hidden: string | null;
  shakeKey: number;
  onPlay: (card: string) => void;
};

/** Your cards, overlapped in a gentle fan, sorted by shape then number. */
export function Hand({ hand, playable, active, hidden, shakeKey, onPlay }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(358);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Shake on a refused play, without remounting the cards.
  useEffect(() => {
    if (!shakeKey || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    box.current?.animate(
      [{ translate: "0" }, { translate: "-6px" }, { translate: "6px" }, { translate: "0" }],
      { duration: 300, easing: "ease-in-out" },
    );
  }, [shakeKey]);

  const cards = hand.filter((c) => c !== hidden).sort((a, b) => order(a) - order(b));
  const n = cards.length;
  const step = n > 1 ? Math.min(W + 6, (width - W) / (n - 1)) : 0;
  const start = (width - (W + step * (n - 1))) / 2;
  const spread = Math.min(3, 24 / Math.max(n, 1));

  return (
    <div
      ref={box}
      className="relative w-full"
      style={{ height: H + 18 }}
      role="group"
      aria-label={`Your hand, ${n} ${n === 1 ? "card" : "cards"}`}
    >
      {cards.map((id, i) => {
        const mid = i - (n - 1) / 2;
        const can = active && playable.has(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onPlay(id)}
            disabled={!active}
            aria-label={`${cardLabel(id)}${active && !can ? " (can't play)" : ""}`}
            className={`absolute bottom-0 origin-bottom rounded-playing-card shadow-sm transition-[translate,rotate,opacity,left] duration-(--dur-card) ease-standard starting:translate-y-10 starting:opacity-0 focus-visible:z-10 disabled:cursor-default ${active && !can ? "opacity-55" : ""}`}
            style={{
              left: start + i * step,
              rotate: `${mid * spread}deg`,
              translate: `0 ${Math.abs(mid) * Math.abs(mid) * 0.5 - (can ? LIFT : 0)}px`,
            }}
          >
            <WhotCard id={id} width={W} />
          </button>
        );
      })}
    </div>
  );
}
