"use client";

import { type Colour, type LudoState } from "@gamehub/engine/ludo";
import { BoardBase } from "./board-base";
import { COLOUR_HEX, seedXY, tint } from "./geometry";

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
        <BoardBase />

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
                  r="2.2"
                  fill={tint(COLOUR_HEX[colour], 0.5)}
                />
              );
            })
          : null}

        {[...spots.values()].map((group) => {
          const first = group[0] as Disc;
          const sameColour = group.every((d) => d.colour === first.colour);
          const layout =
            group.length === 1 || sameColour
              ? [{ d: group.find(movable) ?? first, dx: 0, dy: 0, r: 4.6, count: group.length }]
              : group.map((d, i) => ({
                  d,
                  dx: [-2.3, 2.3, 2.3, -2.3][i % 4] ?? 0,
                  dy: [-2.3, 2.3, -2.3, 2.3][i % 4] ?? 0,
                  r: 3,
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
                {can ? <circle cx={cx} cy={cy} r="7" fill="transparent" /> : null}
                {/* Counter-turned so numbers read upright and the bob goes up on screen. */}
                <g transform={`rotate(${-angle} ${cx} ${cy})`}>
                  {/* Shadow stays on the square; the disc bobs above it when it can move. */}
                  <ellipse
                    cx={cx}
                    cy={cy + r * 0.55}
                    rx={r * 0.85}
                    ry={r * 0.35}
                    fill="#1A1C20"
                    opacity="0.15"
                  />
                  <g className={can ? "animate-seed-bob" : undefined}>
                    {can ? (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r + 1.4}
                        fill="none"
                        stroke="#1A1C20"
                        strokeWidth="0.6"
                        className="hidden motion-reduce:block"
                      />
                    ) : null}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={COLOUR_HEX[d.colour]}
                      stroke="#fff"
                      strokeWidth="1"
                    />
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
              </g>
            );
          });
        })}
      </g>
    </svg>
  );
}
