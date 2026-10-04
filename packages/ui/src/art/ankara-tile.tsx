const palettes = {
  /** On paper: barely-there brand and accent tints. */
  paper: { diamond: "#E3F2EA", dot: "#E6A23C", corner: "#FCF1DD", line: "#E4DFD4" },
  /** On the brand green panel. */
  brand: { diamond: "#12895A", dot: "#E6A23C", corner: "#0A5E3C", line: "#13915F" },
} as const;

// Circles at the corners meet up with the neighbouring tiles (the SVG clips the overflow).
const CORNERS = [
  [0, 0],
  [40, 0],
  [0, 40],
  [40, 40],
] as const;

export type AnkaraTone = keyof typeof palettes;

/**
 * One 40×40 repeat of the Ankara-inspired pattern: diamonds, dots and corner
 * rosettes. Exported to a static SVG and used as a CSS background.
 */
export function AnkaraTile({ tone = "paper" }: { tone?: AnkaraTone }) {
  const c = palettes[tone];
  return (
    <svg viewBox="0 0 40 40" width="40" height="40">
      <path d="M0 20h40M20 0v40" stroke={c.line} strokeWidth="1" />
      <path d="M20 7l13 13-13 13L7 20z" fill={c.diamond} />
      <path d="M20 13l7 7-7 7-7-7z" fill="none" stroke={c.corner} strokeWidth="1.5" />
      <circle cx="20" cy="20" r="2.5" fill={c.dot} />
      {CORNERS.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="6" fill={c.corner} />
          <circle cx={x} cy={y} r="2" fill={c.dot} />
        </g>
      ))}
    </svg>
  );
}
