"use client";

import { formation, positionPenalty, type Card } from "@gamehub/engine/football";
import { initials } from "./look";

/**
 * A flat green pitch (design system: #2E7D4F, white lines at 60 %) with the formation's slots,
 * your goal at the bottom. Slot dots carry the player's initials, short name and OVR; empty slots
 * show the position. `glow`: the slot being drafted; `selected`: the first tap of a swap.
 */
export function Pitch({
  formationId,
  xi,
  cards,
  chem,
  glow,
  selected,
  onSlot,
  compact,
  tiny,
}: {
  /** Formation thumbnails: small dots, no labels. */
  tiny?: boolean;
  formationId: number | null;
  /** Player id in each slot (or missing). */
  xi: Record<number, string | undefined>;
  cards: Record<string, Card>;
  /** Chemistry points per slot (0–3), shown as pips. */
  chem?: number[];
  glow?: number | null;
  selected?: number | null;
  onSlot?: (slot: number) => void;
  compact?: boolean;
}) {
  const slots = formationId ? formation(formationId).slots : [];
  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-card"
      style={{
        aspectRatio: compact ? "4 / 3" : "3 / 4",
        maxHeight: compact ? "36dvh" : "46dvh",
        background: "#2E7D4F",
      }}
    >
      <PitchLines />
      {slots.map((s, i) => {
        const id = xi[i];
        const c = id ? cards[id] : undefined;
        const pen = c ? positionPenalty(c, s.pos) : 0;
        const lit = glow === i;
        const picked = selected === i;
        return (
          <Slot
            key={i}
            onClick={onSlot ? () => onSlot(i) : undefined}
            aria-label={c ? `${c.short}, ${s.pos}, ${c.ovr}` : `Empty ${s.pos}`}
            className="absolute flex w-[18%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
            style={{
              // The keeper gets the bottom of the pitch to himself; everyone else is spread from the
              // back line (y 18 → 74 %) to the strikers (y 86 → 10 %), so a back three's middle
              // centre-back doesn't sit on the keeper and labels stay off the edges.
              left: `${Math.min(91, Math.max(9, s.x))}%`,
              top: `${s.pos === "GK" ? 89 : 10 + ((86 - s.y) / 68) * 64}%`,
            }}
          >
            <span
              className={`flex ${tiny ? "size-[min(5vw,1.25rem)] text-[0px]" : compact ? "size-[min(8vw,2.2rem)] text-[min(2.8vw,0.75rem)]" : "size-[min(9vw,2.6rem)] text-[min(3vw,0.8rem)]"} items-center justify-center rounded-full border-2 font-bold transition-transform ${c ? "bg-surface text-ink" : "border-dashed bg-white/15 text-white"} ${lit ? "scale-110 border-accent ring-4 ring-accent/60" : picked ? "border-accent ring-4 ring-accent" : "border-white/80"}`}
            >
              {c ? initials(c.name) : s.pos}
            </span>
            {c ? (
              <span className="max-w-full truncate rounded bg-black/35 px-1 text-[min(2.6vw,0.7rem)] leading-tight font-semibold text-white">
                <span className="font-bold tabular-nums">{c.ovr}</span> {c.short}
              </span>
            ) : null}
            {c && pen ? (
              <span className="rounded bg-danger px-1 text-[10px] font-bold text-ink">−{pen}</span>
            ) : c && chem ? (
              <span className="flex gap-0.5" aria-label={`Chemistry ${chem[i] ?? 0} of 3`}>
                {[0, 1, 2].map((k) => (
                  <span
                    key={k}
                    className={`size-1.5 rounded-full ${k < (chem[i] ?? 0) ? "bg-accent" : "bg-white/35"}`}
                  />
                ))}
              </span>
            ) : null}
          </Slot>
        );
      })}
    </div>
  );
}

/** A slot: a button when it can be tapped, otherwise a plain element (pitches sit inside buttons). */
function Slot({
  onClick,
  children,
  ...rest
}: {
  onClick?: () => void;
  children: React.ReactNode;
  className: string;
  style: React.CSSProperties;
  "aria-label": string;
}) {
  return onClick ? (
    <button type="button" onClick={onClick} {...rest}>
      {children}
    </button>
  ) : (
    <div role="img" {...rest}>
      {children}
    </div>
  );
}

function PitchLines() {
  const line = "rgb(255 255 255 / 0.6)";
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 size-full"
      aria-hidden="true"
    >
      <g fill="none" stroke={line} strokeWidth="0.6" vectorEffect="non-scaling-stroke">
        <rect x="3" y="2" width="94" height="96" />
        <line x1="3" y1="50" x2="97" y2="50" />
        <circle cx="50" cy="50" r="9" />
        <rect x="25" y="2" width="50" height="14" />
        <rect x="25" y="84" width="50" height="14" />
        <rect x="38" y="2" width="24" height="5" />
        <rect x="38" y="93" width="24" height="5" />
      </g>
    </svg>
  );
}

/** The mini-pitch strip on the match screen: which third the ball is in, lighting up on chances. */
export function BallStrip({
  team,
  zone,
  flash,
  colours,
}: {
  /** Who had it (0 home attacks right, 1 away attacks left). */
  team: 0 | 1;
  zone: 0 | 1 | 2;
  flash: "goal" | "chance" | null;
  colours: [string, string];
}) {
  // Home attacks to the right: its final third is the right third; away's is the left.
  const third = team === 0 ? zone : 2 - zone;
  return (
    <div
      className="relative h-10 overflow-hidden rounded-control"
      style={{ background: "#2E7D4F" }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <g
          fill="none"
          stroke="rgb(255 255 255 / 0.6)"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        >
          <rect x="1" y="1" width="98" height="18" />
          <line x1="50" y1="1" x2="50" y2="19" />
          <circle cx="50" cy="10" r="4" />
          <rect x="1" y="5" width="9" height="10" />
          <rect x="90" y="5" width="9" height="10" />
        </g>
      </svg>
      <div
        className={`absolute inset-y-0 w-1/3 transition-[left] duration-500 ${flash ? "animate-pulse" : ""}`}
        style={{
          left: `${third * 33.33}%`,
          background: flash === "goal" ? "rgb(230 162 60 / 0.55)" : `${colours[team]}55`,
        }}
      />
      <span
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink bg-white shadow-sm transition-[left] duration-500"
        style={{ left: `${third * 33.33 + 16.66 + (flash ? (team === 0 ? 10 : -10) : 0)}%` }}
      />
    </div>
  );
}
