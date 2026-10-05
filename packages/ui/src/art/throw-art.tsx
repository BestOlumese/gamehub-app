export type ThrowName = "rock" | "paper" | "scissors";

/** Drawn rock, paper and scissors on a 100×100 box. Decorative: pair with a text label. */
export function ThrowArt({ pick, className }: { pick: ThrowName; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {pick === "rock" ? (
        <g>
          <ellipse cx="50" cy="80" rx="30" ry="5" fill="#1A1C20" opacity="0.1" />
          <path d="M22 66l6-26 18-12 20 6 12 20-6 18-22 6z" fill="#8A8E94" />
          <path d="M28 40l18-12 20 6-14 10z" fill="#A9ADB2" />
          <path
            d="M34 50l10-4M58 58l8 6M46 66l6-2"
            stroke="#6E7278"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
      ) : pick === "paper" ? (
        <g transform="rotate(-6 50 50)">
          <ellipse cx="52" cy="84" rx="26" ry="4" fill="#1A1C20" opacity="0.08" />
          <path
            d="M28 16h34l12 12v54H28z"
            fill="#FFFFFF"
            stroke="#55595F"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M62 16v12h12"
            fill="none"
            stroke="#55595F"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M36 40h28M36 50h28M36 60h20"
            stroke="#8A8E94"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g>
          <ellipse cx="50" cy="86" rx="24" ry="4" fill="#1A1C20" opacity="0.08" />
          <path
            d="M46 52L76 16M54 52L24 16"
            stroke="#8A8E94"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx="50" cy="52" r="3.5" fill="#1A1C20" />
          <circle cx="36" cy="70" r="11" fill="none" stroke="#E05A47" strokeWidth="6" />
          <circle cx="64" cy="70" r="11" fill="none" stroke="#E05A47" strokeWidth="6" />
          <path d="M42 62l6-8M58 62l-6-8" stroke="#E05A47" strokeWidth="6" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
