const MAROON = "#7A1F2B";

export type WhotShape = "circle" | "triangle" | "cross" | "square" | "star";

function Shape({ shape }: { shape: WhotShape }) {
  switch (shape) {
    case "circle":
      return <circle cx="30" cy="44" r="13" fill={MAROON} />;
    case "triangle":
      return <path d="M30 29l15 26H15z" fill={MAROON} />;
    case "cross":
      return <path d="M25 30h10v9h9v10h-9v9H25v-9h-9V39h9z" fill={MAROON} />;
    case "square":
      return <rect x="18" y="32" width="24" height="24" fill={MAROON} />;
    case "star":
      return (
        <path
          d="M30 28l4.4 9.5 10.4 1.2-7.7 7 2.1 10.3L30 50.8 20.8 56l2.1-10.3-7.7-7 10.4-1.2z"
          fill={MAROON}
        />
      );
  }
}

/** A classic Whot card face on a 60×88 box. A <g>, place it with a transform. */
export function WhotCardArt({ shape, number }: { shape: WhotShape; number: number }) {
  return (
    <g>
      <rect width="60" height="88" rx="7" fill="#FFFFFF" stroke="#E4DFD4" strokeWidth="1.2" />
      <text
        x="7"
        y="16"
        fontSize="12"
        fontWeight="800"
        fontFamily="Arial, Helvetica, sans-serif"
        fill={MAROON}
      >
        {number}
      </text>
      <text
        fontFamily="Arial, Helvetica, sans-serif"
        x="53"
        y="80"
        fontSize="12"
        fontWeight="800"
        fill={MAROON}
        textAnchor="end"
      >
        {number}
      </text>
      <Shape shape={shape} />
    </g>
  );
}
