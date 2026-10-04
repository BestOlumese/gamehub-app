/** A standing Ludo seed (pawn) on a 24×32 box. */
export function SeedArt({ color }: { color: string }) {
  return (
    <g>
      <ellipse cx="12" cy="29" rx="10" ry="3" fill="#1A1C20" opacity="0.12" />
      <path d="M5 28c0-6 3-10 7-12 4 2 7 6 7 12z" fill={color} />
      <circle cx="12" cy="10" r="7" fill={color} />
      <circle cx="9.5" cy="7.5" r="2" fill="#FFFFFF" opacity="0.45" />
    </g>
  );
}
