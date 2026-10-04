const xMark = (cx: number, cy: number) => (
  <path
    key={`x${cx}-${cy}`}
    d={`M${cx - 8} ${cy - 8}l16 16M${cx + 8} ${cy - 8}l-16 16`}
    stroke="#1A1C20"
    strokeWidth="4.5"
    strokeLinecap="round"
  />
);

const oMark = (cx: number, cy: number) => (
  <circle
    key={`o${cx}-${cy}`}
    cx={cx}
    cy={cy}
    r="9"
    fill="none"
    stroke="#0E7A4E"
    strokeWidth="4.5"
  />
);

export function GameTicTacToeArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
      <g stroke="#E4DFD4" strokeWidth="3" strokeLinecap="round">
        <path d="M65 14v84M95 14v84M38 41h84M38 71h84" />
      </g>
      {xMark(50, 27)}
      {oMark(80, 27)}
      {xMark(80, 56)}
      {oMark(110, 56)}
      {xMark(110, 86)}
      <path d="M44 21l72 71" stroke="#E6A23C" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}
