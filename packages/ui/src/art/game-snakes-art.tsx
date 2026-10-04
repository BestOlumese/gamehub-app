export function GameSnakesArt({ className }: { className?: string }) {
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={30 + c * 20}
          y={10 + r * 22}
          width="20"
          height="22"
          fill={(r + c) % 2 === 0 ? "#FFFDF8" : "#F2EFE8"}
        />,
      );
    }
  }
  return (
    <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
      <rect x="30" y="10" width="100" height="88" rx="6" fill="#FFFDF8" />
      {cells}
      <rect
        x="30"
        y="10"
        width="100"
        height="88"
        rx="6"
        fill="none"
        stroke="#E4DFD4"
        strokeWidth="1.5"
      />
      {/* Ladder */}
      <g stroke="#55595F" strokeWidth="2.5" strokeLinecap="round">
        <path d="M44 90L78 22M56 94L90 26" />
        <path
          d="M48 82l12 4M53 72l12 4M58 62l12 4M63 52l12 4M68 42l12 4M73 32l12 4"
          strokeWidth="2"
        />
      </g>
      {/* Snake */}
      <path
        d="M114 20c-14 4-4 18-16 24s-18 8-12 22 22 6 18 24"
        fill="none"
        stroke="#8E5BD9"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="115" cy="19" r="6" fill="#8E5BD9" />
      <circle cx="117" cy="17.5" r="1.4" fill="#FFFFFF" />
      {/* Tokens */}
      <circle cx="40" cy="20" r="5" fill="#E07A2E" stroke="#FFFFFF" strokeWidth="1.5" />
      <circle cx="120" cy="88" r="5" fill="#1AA3A3" stroke="#FFFFFF" strokeWidth="1.5" />
    </svg>
  );
}
