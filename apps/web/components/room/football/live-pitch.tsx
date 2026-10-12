"use client";

import type { Card, TeamSheet } from "@gamehub/engine/football";
import { frameAt } from "./live-frames";
import type { Timed } from "./playback";

/** Stripes across the pitch's length (it lies sideways here). */
const GRASS_SIDEWAYS =
  "repeating-linear-gradient(to right, #2E7D4F 0 8.333%, #2A744A 8.333% 16.666%)";

/**
 * The live 2D viewer (design decision, Oct 2026): both teams as dots in their formations, the
 * ball going to whoever is on it with their name under it, teams pushing up and dropping back,
 * and on a goal the ball in the net with a short banner. Home attacks right. Decorative: the
 * commentary under it carries the same moments for screen readers.
 */
export function LivePitch({
  timed,
  now,
  kick,
  current,
  cards,
  colours,
}: {
  timed: readonly Timed[];
  now: number;
  kick: readonly [TeamSheet, TeamSheet];
  current: readonly [TeamSheet, TeamSheet];
  cards: Record<string, Card>;
  colours: readonly [string, string];
}) {
  const f = frameAt(timed, now, kick, current);
  // The banner's words come from the latest goal shown, so they stay while it fades out.
  const lastGoal = timed.findLast((t) => t.at <= now && t.e.t === "goal")?.e;
  const banner = lastGoal?.t === "goal" ? { player: lastGoal.player, m: lastGoal.m } : null;
  const name = (id: string | null) => (id ? (cards[id]?.short ?? "") : "");
  const move = "motion-safe:transition-[left,top] motion-safe:ease-in-out";
  return (
    <div
      className="relative w-full overflow-hidden rounded-card"
      style={{ aspectRatio: "16 / 10", background: GRASS_SIDEWAYS }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 160 100" className="absolute inset-0 size-full">
        <g
          fill="none"
          stroke="rgb(255 255 255 / 0.5)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        >
          <rect x="3" y="3" width="154" height="94" />
          <line x1="80" y1="3" x2="80" y2="97" />
          <circle cx="80" cy="50" r="12" />
          <rect x="3" y="27" width="22" height="46" />
          <rect x="135" y="27" width="22" height="46" />
          <rect x="3" y="40" width="8" height="20" />
          <rect x="149" y="40" width="8" height="20" />
        </g>
        {/* The goals: the one just scored in lights up. */}
        {[0, 1].map((side) => (
          <rect
            key={side}
            x={side === 0 ? 0.5 : 157}
            y="43"
            width="2.5"
            height="14"
            className="motion-safe:transition-[fill] motion-safe:duration-300"
            fill={
              f.banner && f.banner.side !== side
                ? "rgb(230 162 60 / 0.95)"
                : "rgb(255 255 255 / 0.8)"
            }
          />
        ))}
      </svg>

      {f.dots.map((d, i) => {
        const on = d.id === f.carrier;
        // A small idle sway so the pitch looks alive between moments.
        const sway = on ? 0 : 0.7;
        const x = d.x + Math.sin(now / 1700 + i * 1.3) * sway;
        const y = d.y + Math.cos(now / 2100 + i * 0.9) * sway * 1.4;
        const ring =
          f.card?.id === d.id
            ? f.card.colour === "yellow"
              ? "0 0 0 3px #F2C14E"
              : "0 0 0 3px #D9473F"
            : on
              ? "0 0 0 2px #fff"
              : "none";
        return (
          <span
            key={d.id}
            className={`absolute aspect-square w-[3.4%] min-w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90 ${move} motion-safe:duration-[800ms] ${on ? "z-10 scale-125" : ""}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              background: colours[d.side],
              filter: d.gk ? "brightness(0.7)" : undefined,
              boxShadow: ring,
            }}
          />
        );
      })}

      {/* The ball, and who has it. */}
      <span
        className={`absolute z-20 aspect-square w-[2.4%] min-w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink bg-white shadow ${move} motion-safe:duration-[800ms]`}
        style={{ left: `${f.ball.x}%`, top: `${f.ball.y}%` }}
      />
      {f.carrier ? (
        <span
          className={`absolute z-20 -translate-x-1/2 translate-y-2 rounded-full bg-[rgb(0_0_0/0.6)] px-1.5 text-[10px] leading-4 font-semibold whitespace-nowrap text-white ${move} motion-safe:duration-[800ms]`}
          style={{ left: `${Math.min(88, Math.max(12, f.ball.x))}%`, top: `${f.ball.y}%` }}
        >
          {name(f.carrier)}
        </span>
      ) : null}

      {/* Goal banner. */}
      <div
        className={`absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 justify-center motion-safe:transition-[opacity,transform] motion-safe:duration-300 ${f.banner ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}
      >
        {banner ? (
          <span className="rounded-full bg-accent px-4 py-1.5 font-display text-lg font-extrabold text-ink shadow-lg">
            GOAL · {name(banner.player)} {banner.m}&apos;
          </span>
        ) : null}
      </div>
    </div>
  );
}
