"use client";

import { formation, positionPenalty, type Card } from "@gamehub/engine/football";
import { useId } from "react";

/** Grass: soft mowing stripes in two greens (design decision, Oct 2026). */
export const GRASS = "repeating-linear-gradient(to bottom, #2E7D4F 0 10%, #2A744A 10% 20%)";

/** Ring colour for a player's chemistry points (0–3). */
const CHEM_RING = ["rgb(255 255 255 / 0.55)", "#F2C14E", "#F2C14E", "#8EE59B"] as const;

/** The key to the ring colours, under a pitch that shows chemistry. */
export function ChemistryKey() {
  const item = (colour: string, label: string) => (
    <span className="flex items-center gap-1">
      <span
        className="inline-block size-3 rounded-full bg-surface"
        style={{ boxShadow: `0 0 0 2px ${colour}` }}
      />
      {label}
    </span>
  );
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
      <span>Chemistry ring:</span>
      {item("#C9BFAF", "none")}
      {item("#F2C14E", "some")}
      {item("#4CC368", "full")}
    </p>
  );
}

/**
 * The pitch with the formation's slots, your goal at the bottom (design decision, Oct 2026:
 * "rating discs" on mowing stripes). A filled slot is a disc with the player's OVR, its ring
 * coloured by chemistry, a red corner badge when he's out of position, and his short name in a
 * pill under it. Empty slots show the position. `glow`: the slot being drafted; `selected`: the
 * first tap of a swap.
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
}: {
  formationId: number | null;
  /** Player id in each slot (or missing). */
  xi: Record<number, string | undefined>;
  cards: Record<string, Card>;
  /** Chemistry points per slot (0–3), shown as the disc's ring. */
  chem?: number[];
  glow?: number | null;
  selected?: number | null;
  onSlot?: (slot: number) => void;
  /** The draft: a shorter pitch so the option cards fit under it. */
  compact?: boolean;
}) {
  const slots = formationId ? formation(formationId).slots : [];
  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-card"
      style={{
        aspectRatio: compact ? "1 / 1" : "4 / 5",
        maxHeight: compact ? "42dvh" : "54dvh",
        background: GRASS,
      }}
    >
      <PitchLines />
      {slots.map((s, i) => {
        const id = xi[i];
        const c = id ? cards[id] : undefined;
        const pen = c ? positionPenalty(c, s.pos) : 0;
        const lit = glow === i;
        const picked = selected === i;
        const pts = chem?.[i] ?? 0;
        const ring =
          lit || picked ? "#E6A23C" : c && chem ? CHEM_RING[pts] : "rgb(255 255 255 / 0.8)";
        return (
          <Slot
            key={i}
            onClick={onSlot ? () => onSlot(i) : undefined}
            aria-label={
              c
                ? `${c.short}, ${s.pos}, ${c.ovr}${pen ? `, out of position −${pen}` : ""}${chem ? `, chemistry ${pts} of 3` : ""}`
                : `Empty ${s.pos}`
            }
            className="absolute flex w-[22%] -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{
              // The keeper sits at the bottom on his own; everyone else is spread from the back line
              // (y 18 → 73 %) to the strikers (y 86 → 9 %), so rows don't run into each other.
              left: `${Math.min(90, Math.max(10, s.x))}%`,
              top: `${s.pos === "GK" ? 88 : 9 + ((86 - s.y) / 68) * 64}%`,
            }}
          >
            <span
              className={`relative flex ${compact ? "size-[min(7.5vw,2rem)] text-[min(3.2vw,0.85rem)]" : "size-[min(8.5vw,2.3rem)] text-[min(3.6vw,0.95rem)]"} items-center justify-center rounded-full font-extrabold tabular-nums transition-transform ${c ? "bg-surface text-ink shadow-sm" : "border-2 border-dashed bg-white/10 text-[min(2.8vw,0.75rem)] text-white"} ${lit ? "scale-110" : ""}`}
              style={
                c
                  ? { boxShadow: `0 0 0 ${lit || picked ? 4 : 3}px ${ring}` }
                  : { borderColor: lit ? "#E6A23C" : "rgb(255 255 255 / 0.7)" }
              }
            >
              {c ? c.ovr : s.pos}
              {c && pen ? (
                <span className="absolute -top-1.5 -right-2 rounded-full bg-danger px-1 text-[9px] leading-4 font-bold text-white">
                  −{pen}
                </span>
              ) : null}
            </span>
            {c ? (
              <span className="relative -mt-1.5 max-w-full truncate rounded-full bg-[rgb(0_0_0/0.55)] px-1.5 text-[min(2.6vw,0.7rem)] leading-4 font-semibold text-white">
                {c.short}
              </span>
            ) : null}
          </Slot>
        );
      })}
    </div>
  );
}

/** A slot: a button when it can be tapped, otherwise a plain element. */
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
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 size-full"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="rgb(255 255 255 / 0.45)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      >
        <rect x="3" y="2" width="94" height="96" rx="0.5" />
        <line x1="3" y1="50" x2="97" y2="50" />
        <ellipse cx="50" cy="50" rx="11" ry="8" />
        <rect x="24" y="2" width="52" height="13" />
        <rect x="24" y="85" width="52" height="13" />
        <rect x="38" y="2" width="24" height="5" />
        <rect x="38" y="93" width="24" height="5" />
      </g>
    </svg>
  );
}

/**
 * A formation's shape for the formation list: solid dots on plain stripes, no lines under them
 * (design decision, Oct 2026).
 */
export function FormationShape({ id, className }: { id: number; className?: string }) {
  const slots = formation(id).slots;
  const grass = `fs-grass-${useId()}`;
  return (
    <svg viewBox="0 0 60 76" className={className} aria-hidden="true">
      <defs>
        <pattern id={grass} width="60" height="15.2" patternUnits="userSpaceOnUse">
          <rect width="60" height="7.6" fill="#2E7D4F" />
          <rect y="7.6" width="60" height="7.6" fill="#2A744A" />
        </pattern>
      </defs>
      <rect width="60" height="76" rx="6" fill={`url(#${grass})`} />
      {slots.map((s, i) => (
        <circle
          key={i}
          cx={6 + (Math.min(92, Math.max(8, s.x)) / 100) * 48}
          cy={s.pos === "GK" ? 69 : 8 + ((86 - s.y) / 68) * 50}
          r="3.6"
          fill="#fff"
        />
      ))}
    </svg>
  );
}
