const MAROON = "#7A1F2B";

/** The maroon back of a Whot card on a 60×88 box. */
export function WhotCardBackArt() {
  return (
    <g>
      <rect width="60" height="88" rx="7" fill={MAROON} />
      <rect
        x="5"
        y="5"
        width="50"
        height="78"
        rx="4"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />
      <text
        fontFamily="Arial, Helvetica, sans-serif"
        x="30"
        y="48"
        fontSize="13"
        fontWeight="800"
        fill="#FFFFFF"
        textAnchor="middle"
        letterSpacing="1"
        transform="rotate(-90 30 44)"
      >
        WHOT
      </text>
    </g>
  );
}
