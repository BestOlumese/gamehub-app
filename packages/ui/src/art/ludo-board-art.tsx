const RED = "#D9473A";
const GREEN = "#1F9D5B";
const YELLOW = "#E8B021";
const BLUE = "#2F6FD6";
const LINE = "#E4DFD4";

// Cell borders of the four arms (10-unit cells), precomputed as one path.
const GRID =
  "M60 0V60M60 90V150M70 0V60M70 90V150M80 0V60M80 90V150M90 0V60M90 90V150M60 0H90M60 10H90M60 20H90M60 30H90M60 40H90M60 50H90M60 60H90M60 90H90M60 100H90M60 110H90M60 120H90M60 130H90M60 140H90M60 150H90M0 60H60M90 60H150M0 70H60M90 70H150M0 80H60M90 80H150M0 90H60M90 90H150M0 60V90M10 60V90M20 60V90M30 60V90M40 60V90M50 60V90M60 60V90M90 60V90M100 60V90M110 60V90M120 60V90M130 60V90M140 60V90M150 60V90";

const SEED_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [22, 22],
  [38, 22],
  [22, 38],
  [38, 38],
];

const YARDS = [
  { x: 0, y: 0, c: RED },
  { x: 90, y: 0, c: GREEN },
  { x: 90, y: 90, c: YELLOW },
  { x: 0, y: 90, c: BLUE },
];

/**
 * A simplified 15×15 Ludo board as an SVG group, drawn on a 150-unit square.
 * Place it with a transform; it has no outer <svg>.
 */
export function LudoBoardArt({ seeds = true }: { seeds?: boolean }) {
  return (
    <g>
      <rect width="150" height="150" rx="8" fill="#FFFDF8" />
      <path d="M60 0h30v150H60zM0 60h150v30H0z" fill="#FFFFFF" />
      {/* Home stretches */}
      <path d="M70 10h10v50H70z" fill={GREEN} />
      <path d="M90 70h50v10H90z" fill={YELLOW} />
      <path d="M70 90h10v50H70z" fill={BLUE} />
      <path d="M10 70h50v10H10z" fill={RED} />
      <path d={GRID} stroke={LINE} strokeWidth="0.8" fill="none" />
      {YARDS.map((y) => (
        <g key={y.c}>
          <rect x={y.x + 2} y={y.y + 2} width="56" height="56" rx="7" fill={y.c} />
          <rect x={y.x + 12} y={y.y + 12} width="36" height="36" rx="5" fill="#FFFFFF" />
          {seeds
            ? SEED_SPOTS.map(([sx, sy]) => (
                <circle
                  key={`${sx}-${sy}`}
                  cx={y.x + sx}
                  cy={y.y + sy}
                  r="5"
                  fill={y.c}
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              ))
            : null}
        </g>
      ))}
      <path d="M60 60h30L75 75z" fill={GREEN} />
      <path d="M90 60v30L75 75z" fill={YELLOW} />
      <path d="M90 90H60l15-15z" fill={BLUE} />
      <path d="M60 90V60l15 15z" fill={RED} />
      <rect width="150" height="150" rx="8" fill="none" stroke={LINE} strokeWidth="1.5" />
    </g>
  );
}
