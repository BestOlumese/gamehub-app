import { parseCard, type Shape } from "@gamehub/engine/whot";
import { WhotCardBackArt } from "@gamehub/ui/art/whot-card-back-art";

const MAROON = "var(--color-whot)";

/** Each shape drawn in a unit box around (0, 0). */
const PATHS: Record<Shape, string> = {
  circle: "M0 -0.9a0.9 0.9 0 1 1 0 1.8a0.9 0.9 0 1 1 0 -1.8Z",
  triangle: "M0 -0.92L0.98 0.8H-0.98Z",
  cross: "M-0.2 -0.9h0.4v0.7h0.7v0.4h-0.7v0.7h-0.4v-0.7h-0.7v-0.4h0.7Z",
  square: "M-0.78 -0.78h1.56v1.56h-1.56Z",
  star: "M0 -0.92L0.265 -0.284L0.951 -0.229L0.428 0.219L0.588 0.889L0 0.53L-0.588 0.889L-0.428 0.219L-0.951 -0.229L-0.265 -0.284Z",
};

export const SHAPE_NAMES: Record<Shape, string> = {
  circle: "Circle",
  triangle: "Triangle",
  cross: "Cross",
  square: "Square",
  star: "Star",
};

/** A shape glyph for buttons and badges (inherits text colour). */
export function ShapeIcon({ shape, size = 18 }: { shape: Shape; size?: number }) {
  return (
    <svg viewBox="-1 -1 2 2" width={size} height={size} aria-hidden="true">
      <path d={PATHS[shape]} fill="currentColor" />
    </svg>
  );
}

export function cardLabel(id: string) {
  const c = parseCard(id);
  return c.shape === "whot" ? "Whot 20" : `${SHAPE_NAMES[c.shape]} ${c.n}`;
}

function Corner({ n, shape }: { n: number; shape: Shape | "whot" }) {
  return (
    <>
      <text
        x="7.5"
        y="16"
        fontSize="13"
        fontWeight="800"
        textAnchor="middle"
        fill={MAROON}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {n}
      </text>
      {shape === "whot" ? null : (
        <path d={PATHS[shape]} transform="translate(7.5 23) scale(3.4)" fill={MAROON} />
      )}
    </>
  );
}

/** A classic Nigerian Whot card: white face, maroon shape, number in two corners. 60×88. */
export function WhotCard({ id, width = 64 }: { id: string; width?: number }) {
  const { shape, n } = parseCard(id);
  return (
    <svg viewBox="0 0 60 88" width={width} height={(width * 88) / 60} aria-hidden="true">
      <rect x="0.6" y="0.6" width="58.8" height="86.8" rx="6" fill="#fff" stroke="#E4DFD4" />
      <Corner n={n} shape={shape} />
      <g transform="rotate(180 30 44)">
        <Corner n={n} shape={shape} />
      </g>
      {shape === "whot" ? (
        <text
          x="30"
          y="49"
          fontSize="14"
          fontWeight="800"
          textAnchor="middle"
          letterSpacing="0.5"
          fill={MAROON}
          style={{ fontFamily: "var(--font-display)" }}
        >
          WHOT
        </text>
      ) : (
        <path d={PATHS[shape]} transform="translate(30 45) scale(15)" fill={MAROON} />
      )}
    </svg>
  );
}

export function CardBack({ width = 64 }: { width?: number }) {
  return (
    <svg viewBox="0 0 60 88" width={width} height={(width * 88) / 60} aria-hidden="true">
      <WhotCardBackArt />
    </svg>
  );
}
