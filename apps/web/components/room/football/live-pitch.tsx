"use client";

import { formation, type Card, type TeamSheet, type Timeline } from "@gamehub/engine/football";
import { useEffect, useRef } from "react";
import { cardAt, leavingAt, lineupAt, type Side } from "./live-play";
import { H, LiveSim, W } from "./live-sim";
import { matchNow, type Timed } from "./playback";

/** Stripes across the pitch's length (it lies sideways here). */
const GRASS_SIDEWAYS =
  "repeating-linear-gradient(to right, #2E7D4F 0 8.333%, #2A744A 8.333% 16.666%)";
/** How long the goal banner shows (real ms). */
const BANNER_MS = 2600;

/**
 * The live 2D viewer (design decisions, Oct 2026). `LiveSim` plays the shared timeline with real
 * football physics: the ball rolls, flies and is struck at real speeds, players run with their
 * pace and real acceleration into their places, onto passes, into the box. Quiet minutes play
 * sped up (with a » marker), attacks at real speed. Positions are written straight to the DOM
 * each frame. Decorative: the commentary carries the same moments for screen readers.
 */
export function LivePitch({
  tl,
  timed,
  now,
  offset,
  kick,
  current,
  cards,
  colours,
  mySide,
  fit,
  pause = null,
}: {
  /** The screens' timeline for this half (shared with the server). */
  tl: Timeline;
  /** A timeout in progress: the pitch freezes. */
  pause?: { at: number; until: number } | null;
  /** Your side in this match (stamina markers go on your players only). */
  mySide: Side | null;
  /** Your players' stamina (0–100). */
  fit: Record<string, number> | null;
  timed: readonly Timed[];
  /** The match clock (already frozen during a timeout). */
  now: number;
  offset: number;
  kick: readonly [TeamSheet, TeamSheet];
  current: readonly [TeamSheet, TeamSheet];
  cards: Record<string, Card>;
  colours: readonly [string, string];
}) {
  const lineup = lineupAt(timed, current, now);
  const card = cardAt(timed, now);
  const leaving = leavingAt(timed, now);
  const sentOff = [...leaving].at(-1);
  const players = lineup.ids.flatMap((list, side) =>
    list.flatMap((id, slot) => (id ? [{ id, side: side as Side, slot }] : [])),
  );
  const keeperSlot = (side: Side) =>
    formation(lineup.formation[side]).slots.findIndex((s) => s.pos === "GK");
  const name = (id: string | undefined) => (id ? (cards[id]?.short ?? "") : "");

  // Banners: a goal for a moment after it goes in; a shoot-out kick just after it's taken.
  const goal = timed.findLast((t) => t.e.t === "goal" && t.at <= now && now - t.at < BANNER_MS)?.e;
  const lastGoal = timed.findLast((t) => t.e.t === "goal" && t.at <= now)?.e;
  const pen = timed.findLast((t) => t.e.t === "pen" && t.at <= now && now - t.at < 1000)?.e;
  const banner = goal?.t === "goal" ? `GOAL · ${name(goal.player)} ${goal.m}'` : null;
  const lastText = lastGoal?.t === "goal" ? `GOAL · ${name(lastGoal.player)} ${lastGoal.m}'` : "";
  const penText =
    pen?.t === "pen"
      ? pen.scored
        ? `Scored · ${name(pen.taker)}`
        : `Saved by ${name(pen.keeper)}`
      : null;
  // Fast-forward through a quiet stretch: a small » marker.
  const minute = tl.minutes.findLast((m) => m.start <= now);
  const fast = !!minute && now < minute.start + minute.dur && !minute.busy && minute.ff > 1.5;

  const input = useRef({ tl, timed, kick, current, cards, fit, mySide, offset, pause });
  useEffect(() => {
    input.current = { tl, timed, kick, current, cards, fit, mySide, offset, pause };
  });

  const boxRef = useRef<HTMLDivElement>(null);
  const dotEls = useRef(new Map<string, HTMLSpanElement>());
  const ballEl = useRef<HTMLSpanElement>(null);
  const shadowEl = useRef<HTMLSpanElement>(null);
  const labelEl = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sim = new LiveSim();
    let raf = 0;
    const frame = () => {
      const o = input.current;
      const at = matchNow(Date.now() + o.offset, o.pause);
      const f = sim.update(at, { ...o, reduce });
      const box = boxRef.current;
      if (box) {
        const bw = box.clientWidth;
        const bh = box.clientHeight;
        const px = (x: number) => (x / W) * bw;
        const py = (y: number) => (y / H) * bh;
        for (const p of f.players) {
          const el = dotEls.current.get(p.id);
          if (!el) continue;
          el.style.transform = `translate3d(${px(p.x)}px, ${py(p.y)}px, 0) translate(-50%, -50%)`;
          el.style.outline = p.id === f.carrier ? "2px solid #fff" : "none";
        }
        // Height in metres: the ball drawn raised and bigger, its shadow left on the grass.
        const lift = f.ball.z;
        if (ballEl.current)
          ballEl.current.style.transform = `translate3d(${px(f.ball.x)}px, ${py(f.ball.y - lift * 0.6)}px, 0) translate(-50%, -50%) scale(${1 + Math.min(1, lift / 8)})`;
        if (shadowEl.current) {
          shadowEl.current.style.transform = `translate3d(${px(f.ball.x)}px, ${py(f.ball.y)}px, 0) translate(-50%, -50%)`;
          shadowEl.current.style.opacity = String(Math.max(0.12, 0.35 - lift * 0.03));
        }
        const label = labelEl.current;
        if (label) {
          const p = f.carrier ? f.players.find((x) => x.id === f.carrier) : undefined;
          if (p) {
            const text = o.cards[p.id]?.short ?? "";
            if (label.textContent !== text) label.textContent = text;
            const x = Math.min(0.88 * bw, Math.max(0.12 * bw, px(p.x)));
            label.style.transform = `translate3d(${x}px, ${py(p.y) + 9}px, 0) translate(-50%, 0)`;
            label.style.opacity = "1";
          } else label.style.opacity = "0";
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hidden = "translate3d(-100px, -100px, 0)";
  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden rounded-card"
      style={{ aspectRatio: "105 / 68", background: GRASS_SIDEWAYS }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 105 68" className="absolute inset-0 size-full">
        <g fill="none" stroke="rgb(255 255 255 / 0.5)" strokeWidth="0.35">
          <rect x="0.5" y="0.5" width="104" height="67" />
          <line x1="52.5" y1="0.5" x2="52.5" y2="67.5" />
          <circle cx="52.5" cy="34" r="9.15" />
          <rect x="0.5" y="13.84" width="16.5" height="40.32" />
          <rect x="88" y="13.84" width="16.5" height="40.32" />
          <rect x="0.5" y="24.84" width="5.5" height="18.32" />
          <rect x="99" y="24.84" width="5.5" height="18.32" />
          <circle cx="11" cy="34" r="0.35" fill="rgb(255 255 255 / 0.6)" />
          <circle cx="94" cy="34" r="0.35" fill="rgb(255 255 255 / 0.6)" />
        </g>
        {/* The goals: the one just scored in lights up. */}
        {[0, 1].map((side) => (
          <rect
            key={side}
            x={side === 0 ? -1 : 104.5}
            y="30.34"
            width="1.5"
            height="7.32"
            className="motion-safe:transition-[fill] motion-safe:duration-300"
            fill={
              goal?.t === "goal" && goal.team !== side
                ? "rgb(230 162 60 / 0.95)"
                : "rgb(255 255 255 / 0.85)"
            }
          />
        ))}
      </svg>

      {players.map((p) => {
        const gk = p.slot === keeperSlot(p.side);
        const off = leaving.has(p.id);
        const ring =
          off || (card?.id === p.id && card.colour === "red")
            ? "0 0 0 3px #D9473F"
            : card?.id === p.id
              ? "0 0 0 3px #F2C14E"
              : "none";
        // Your own players' legs: amber when tiring, red when spent.
        const legs = p.side === mySide && !gk ? fit?.[p.id] : undefined;
        const tired =
          legs === undefined ? null : legs < 40 ? "#D9473F" : legs < 55 ? "#F2C14E" : null;
        return (
          <span
            key={p.id}
            data-player={p.id}
            ref={(el) => {
              if (el) dotEls.current.set(p.id, el);
              else dotEls.current.delete(p.id);
            }}
            className="absolute top-0 left-0 aspect-square w-[3.4%] min-w-2.5 rounded-full border border-white/90 will-change-transform"
            style={{
              transform: hidden,
              background: colours[p.side],
              filter: gk ? "brightness(0.7)" : undefined,
              boxShadow: ring,
              outlineOffset: 1,
            }}
          >
            {off ? (
              <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded-sm bg-danger px-1 text-[9px] leading-3.5 font-bold whitespace-nowrap text-white">
                RED · {name(p.id)}
              </span>
            ) : null}
            {tired ? (
              <span
                className="absolute -top-1 -right-1 size-[45%] min-w-1.5 rounded-full border border-white"
                style={{ background: tired }}
              />
            ) : null}
          </span>
        );
      })}

      {/* The ball, its shadow on the grass, and who has it. */}
      <span
        ref={shadowEl}
        className="absolute top-0 left-0 aspect-[2/1] w-[2.6%] min-w-2 rounded-full bg-[rgb(0_0_0/0.6)]"
        style={{ transform: hidden }}
      />
      <span
        ref={ballEl}
        className="absolute top-0 left-0 z-20 aspect-square w-[2.2%] min-w-2 rounded-full border border-ink bg-white"
        style={{ transform: hidden }}
      />
      <span
        ref={labelEl}
        className="absolute top-0 left-0 z-20 rounded-full bg-[rgb(0_0_0/0.6)] px-1.5 text-[10px] leading-4 font-semibold whitespace-nowrap text-white"
        style={{ transform: hidden, opacity: 0 }}
      />

      {/* Fast-forward through a quiet stretch. */}
      {fast ? (
        <span className="absolute top-1.5 right-2 z-30 rounded-full bg-[rgb(0_0_0/0.45)] px-1.5 text-xs font-bold text-white">
          »
        </span>
      ) : null}

      {/* Goal banner. */}
      <div
        className={`absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 justify-center motion-safe:transition-[opacity,transform] motion-safe:duration-300 ${banner ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}
      >
        <span className="rounded-full bg-accent px-4 py-1.5 font-display text-lg font-extrabold text-ink shadow-lg">
          {banner ?? lastText}
        </span>
      </div>
      {/* A sending-off. */}
      {sentOff && !penText ? (
        <div className="absolute inset-x-0 top-[6%] z-30 flex justify-center">
          <span className="rounded-full bg-danger px-3 py-0.5 text-sm font-bold text-white shadow">
            Red card · {name(sentOff)}
          </span>
        </div>
      ) : null}
      {/* Shoot-out result. */}
      {penText ? (
        <div className="absolute inset-x-0 top-[6%] z-30 flex justify-center">
          <span
            className={`rounded-full px-3 py-0.5 text-sm font-bold shadow ${pen?.t === "pen" && pen.scored ? "bg-accent text-ink shadow-[0_3px_0_#b9802a]" : "bg-surface text-ink"}`}
          >
            {penText}
          </span>
        </div>
      ) : null}
    </div>
  );
}
