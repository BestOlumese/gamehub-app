/** "Check your email" illustration. Decorative. */
export function EnvelopeArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true">
      <ellipse cx="80" cy="112" rx="56" ry="5" fill="#1A1C20" opacity="0.08" />
      <rect
        x="22"
        y="38"
        width="116"
        height="70"
        rx="10"
        fill="#FFFFFF"
        stroke="#E4DFD4"
        strokeWidth="2"
      />
      {/* Letter peeking out */}
      <g transform="translate(36 10)">
        <rect width="88" height="70" rx="6" fill="#E3F2EA" stroke="#0E7A4E" strokeWidth="1.5" />
        <rect x="12" y="14" width="44" height="6" rx="3" fill="#0E7A4E" />
        <rect x="12" y="27" width="64" height="5" rx="2.5" fill="#0E7A4E" opacity="0.35" />
        <rect x="12" y="37" width="52" height="5" rx="2.5" fill="#0E7A4E" opacity="0.35" />
        <path
          d="M66 6l3.2 6.6 7.3.9-5.4 5 1.4 7.2L66 22.2l-6.5 3.5 1.4-7.2-5.4-5 7.3-.9z"
          fill="#7A1F2B"
        />
      </g>
      {/* Envelope front */}
      <path
        d="M22 50l58 34 58-34v48a10 10 0 0 1-10 10H32a10 10 0 0 1-10-10z"
        fill="#FFFFFF"
        stroke="#E4DFD4"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M22 108l44-30M138 108L94 78" stroke="#E4DFD4" strokeWidth="2" />
      <circle cx="128" cy="40" r="13" fill="#E6A23C" />
      <path
        d="M122 40l4.5 4.5L135 36"
        fill="none"
        stroke="#1A1C20"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
