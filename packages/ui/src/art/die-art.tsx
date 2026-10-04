const PIPS: Record<1 | 2 | 3 | 4 | 5 | 6, Array<[number, number]>> = {
  1: [[20, 20]],
  2: [
    [11, 11],
    [29, 29],
  ],
  3: [
    [11, 11],
    [20, 20],
    [29, 29],
  ],
  4: [
    [11, 11],
    [29, 11],
    [11, 29],
    [29, 29],
  ],
  5: [
    [11, 11],
    [29, 11],
    [20, 20],
    [11, 29],
    [29, 29],
  ],
  6: [
    [11, 10],
    [29, 10],
    [11, 20],
    [29, 20],
    [11, 30],
    [29, 30],
  ],
};

/** A white die on a 40×40 box. A <g>, place it with a transform. */
export function DieArt({ value }: { value: 1 | 2 | 3 | 4 | 5 | 6 }) {
  return (
    <g>
      <rect width="40" height="40" rx="9" fill="#FFFFFF" stroke="#E4DFD4" strokeWidth="1.2" />
      {PIPS[value].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.4" fill="#1A1C20" />
      ))}
    </g>
  );
}
