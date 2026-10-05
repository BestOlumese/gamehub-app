"use client";

import { SAFE_SQUARES, START, type Colour, type LudoState } from "@gamehub/engine/ludo";
import { LudoBoardArt } from "@gamehub/ui/art/ludo-board-art";
import { COLOUR_HEX, seedXY, startCell, trackCell } from "./geometry";

const STAR = "M0 -3.4L1 -1.1L3.3 -1L1.5 0.6L2.1 2.9L0 1.6L-2.1 2.9L-1.5 0.6L-3.3 -1L-1 -1.1Z";
/** Yellow needs dark text to be readable. */
const TEXT_ON: Record<Colour, string> = {
  red: "#fff",
  green: "#fff",
  yellow: "#1A1C20",
  blue: "#fff",
};

type Disc = { seat: number; seed: number; colour: Colour; x: number; y: number };

type Props = {
  state: LudoState;
  /** Quarter turns so the viewer's yard sits bottom-left. */
  turns: number;
  /** Seat whose seeds can be tapped right now (you, on your move). */
  mover: number | null;
  /** Where each of those seeds would land. */
  targets: Map<number, number>;
  onSeed: (seed: number) => void;
};

/** The 15×15 board, turned for the viewer, with every seed as a flat numbered disc. */
export function LudoBoard({ state, turns, mover, targets, onSeed }: Props) {
  const angle = -90 * turns;
  const discs: Disc[] = [];
  state.seeds.forEach((seeds, seat) => {
    const colour = state.colours[seat] as Colour;
    seeds.forEach((p, seed) => {
      const [x, y] = seedXY(colour, p, seed);
      discs.push({ seat, seed, colour, x, y });
    });
  });

  // Seeds on the same spot: one colour stacks into a disc with a count; mixed colours
  // (sharing a safe square) shrink and sit side by side.
  const spots = new Map<string, Disc[]>();
  for (const d of discs) {
    const k = `${d.x},${d.y}`;
    spots.set(k, [...(spots.get(k) ?? []), d]);
  }

  const movable = (d: Disc) => d.seat === mover && targets.has(d.seed);

  return (
    <svg
      viewBox="0 0 150 150"
      className="block h-auto w-full touch-manipulation select-none"
      role="img"
      aria-label="Ludo board"
    >
      <g transform={`rotate(${angle} 75 75)`}>
        <LudoBoardArt seeds={false} />
        {(Object.keys(START) as Colour[]).map((c) => {
          const [x, y] = startCell(c);
          return <rect key={c} x={x - 5} y={y - 5} width="10" height="10" fill={COLOUR_HEX[c]} />;
        })}
        {[...SAFE_SQUARES]
          .filter((sq) => !Object.values(START).includes(sq))
          .map((sq) => {
            const [x, y] = trackCell(sq);
            return <path key={sq} d={STAR} transform={`translate(${x} ${y})`} fill="#8A8E94" />;
          })}

        {/* Where each of your seeds would land. */}
        {mover !== null
          ? [...targets].map(([seed, to]) => {
              const colour = state.colours[mover] as Colour;
              const [x, y] = seedXY(colour, to, seed);
              return (
                <circle
                  key={`t${seed}`}
                  cx={x}
                  cy={y}
                  r="2"
                  fill={COLOUR_HEX[colour]}
                  opacity="0.35"
                />
              );
            })
          : null}

        {[...spots.values()].map((group) => {
          const first = group[0] as Disc;
          const sameColour = group.every((d) => d.colour === first.colour);
          const layout =
            group.length === 1 || sameColour
              ? [{ d: group.find(movable) ?? first, dx: 0, dy: 0, r: 4.3, count: group.length }]
              : group.map((d, i) => ({
                  d,
                  dx: [-2.3, 2.3, 2.3, -2.3][i % 4] ?? 0,
                  dy: [-2.3, 2.3, -2.3, 2.3][i % 4] ?? 0,
                  r: 2.8,
                  count: 1,
                }));
          return layout.map(({ d, dx, dy, r, count }) => {
            const cx = d.x + dx;
            const cy = d.y + dy;
            const can = movable(d);
            const label = `${d.colour} seed ${d.seed + 1}`;
            return (
              <g
                key={`${d.seat}-${d.seed}`}
                className="transition-transform duration-(--dur-hop) ease-linear"
                {...(can
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-label": `Move ${label}`,
                      onClick: () => onSeed(d.seed),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") onSeed(d.seed);
                      },
                      style: { cursor: "pointer" },
                    }
                  : { "aria-hidden": true })}
              >
                {can ? (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r + 2.2}
                      fill={COLOUR_HEX[d.colour]}
                      opacity="0.25"
                      className="motion-safe:animate-pulse"
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r + 1.6}
                      fill="none"
                      stroke="#1A1C20"
                      strokeWidth="0.7"
                    />
                    <circle cx={cx} cy={cy} r="7" fill="transparent" />
                  </>
                ) : null}
                <circle cx={cx} cy={cy + 0.5} r={r} fill="#1A1C20" opacity="0.15" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={COLOUR_HEX[d.colour]}
                  stroke="#fff"
                  strokeWidth="1"
                />
                <g transform={`rotate(${-angle} ${cx} ${cy})`}>
                  <text
                    x={cx}
                    y={cy + r * 0.36}
                    fontSize={r * 1.05}
                    fontWeight="800"
                    textAnchor="middle"
                    fill={TEXT_ON[d.colour]}
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {d.seed + 1}
                  </text>
                  {count > 1 ? (
                    <>
                      <circle cx={cx + r * 0.85} cy={cy - r * 0.85} r="2.1" fill="#1A1C20" />
                      <text
                        x={cx + r * 0.85}
                        y={cy - r * 0.85 + 0.85}
                        fontSize="2.6"
                        fontWeight="800"
                        textAnchor="middle"
                        fill="#fff"
                      >
                        {count}
                      </text>
                    </>
                  ) : null}
                </g>
              </g>
            );
          });
        })}
      </g>
    </svg>
  );
}
