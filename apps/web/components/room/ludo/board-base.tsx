import { SAFE_SQUARES, START, type Colour } from "@gamehub/engine/ludo";
import { COLOUR_HEX, COLUMN, TRACK_CELLS, tint, YARD_ORIGIN, YARD_SPOTS } from "./geometry";

const COLOURS = Object.keys(START) as Colour[];
const STARTS = new Set(Object.values(START));
const STAR =
  "M0 -3.2L0.95 -1.05L3.1 -0.95L1.45 0.55L1.95 2.75L0 1.5L-1.95 2.75L-1.45 0.55L-3.1 -0.95L-0.95 -1.05Z";
/** Start square → its colour. */
const START_COLOUR = new Map(COLOURS.map((c) => [START[c], c]));

/** One rounded tile per square, with a little gap between: no grid lines. */
function Tile({ r, c, fill }: { r: number; c: number; fill: string }) {
  return <rect x={c * 10 + 0.6} y={r * 10 + 0.6} width="8.8" height="8.8" rx="1.8" fill={fill} />;
}

/**
 * The board without seeds, soft and light: pale tinted yards with a thin coloured border,
 * soft tiles for the track, colour only where it means something (start squares, home
 * lanes, the centre).
 */
export function BoardBase() {
  return (
    <g>
      <rect width="150" height="150" rx="8" fill="#fff" />

      {COLOURS.map((c) => {
        const [x, y] = YARD_ORIGIN[c];
        const hex = COLOUR_HEX[c];
        return (
          <g key={c}>
            <rect
              x={x + 3}
              y={y + 3}
              width="54"
              height="54"
              rx="8"
              fill={tint(hex, 0.13)}
              stroke={hex}
              strokeWidth="1.2"
            />
            <rect x={x + 11} y={y + 11} width="38" height="38" rx="6" fill="#fff" />
            {YARD_SPOTS.map(([sx, sy]) => (
              <circle key={`${sx}-${sy}`} cx={x + sx} cy={y + sy} r="5.2" fill={tint(hex, 0.2)} />
            ))}
          </g>
        );
      })}

      {TRACK_CELLS.map(([r, c], sq) => {
        const owner = START_COLOUR.get(sq);
        return (
          <g key={sq}>
            <Tile r={r} c={c} fill={owner ? COLOUR_HEX[owner] : "#F3F0E9"} />
            {SAFE_SQUARES.has(sq) && !STARTS.has(sq) ? (
              <path d={STAR} transform={`translate(${c * 10 + 5} ${r * 10 + 5})`} fill="#C9C3B6" />
            ) : null}
          </g>
        );
      })}
      {COLOURS.map((c) =>
        COLUMN[c].map(([r, col]) => (
          <Tile key={`${c}-${r}-${col}`} r={r} c={col} fill={tint(COLOUR_HEX[c], 0.85)} />
        )),
      )}

      {/* Home: four soft triangles meeting in the middle. */}
      <path d="M60.6 60.6h28.8L75 75z" fill={tint(COLOUR_HEX.green, 0.45)} />
      <path d="M89.4 60.6v28.8L75 75z" fill={tint(COLOUR_HEX.yellow, 0.45)} />
      <path d="M89.4 89.4H60.6L75 75z" fill={tint(COLOUR_HEX.blue, 0.45)} />
      <path d="M60.6 89.4V60.6L75 75z" fill={tint(COLOUR_HEX.red, 0.45)} />
    </g>
  );
}
