export function GameRpsArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
      {/* Rock */}
      <circle cx="40" cy="58" r="24" fill="#FCF1DD" />
      <path d="M28 64l3-14 10-6 11 4 4 12-6 9-14 2z" fill="#8A8E94" />
      <path
        d="M33 52l7-3 7 3"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.6"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Paper */}
      <circle cx="80" cy="44" r="24" fill="#E3F2EA" />
      <rect
        x="69"
        y="30"
        width="22"
        height="28"
        rx="2"
        fill="#FFFFFF"
        stroke="#55595F"
        strokeWidth="1.5"
        transform="rotate(-6 80 44)"
      />
      <path
        d="M73 38h13M73 44h13M73 50h9"
        stroke="#8A8E94"
        strokeWidth="1.5"
        strokeLinecap="round"
        transform="rotate(-6 80 44)"
      />
      {/* Scissors */}
      <circle cx="120" cy="58" r="24" fill="#FBE7E3" />
      <g fill="none" stroke="#1A1C20" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="112" cy="68" r="5" />
        <circle cx="126" cy="70" r="5" />
        <path d="M115 64l14-20M123 66l-9-22" />
      </g>
    </svg>
  );
}
