// Naija Plots tokens: flat icons of everyday Naija things, in each player's colour (decided with
// Best, Oct 2026). Our own drawings, 24 × 24, white strokes on a coloured disc.
import { TOKEN_COLOURS } from "../snakes/geometry";

export const TOKEN_NAMES = [
  "Danfo",
  "Keke",
  "Okada",
  "Generator",
  "Jollof pot",
  "Gele",
  "Talking drum",
  "Football",
] as const;

const ICONS: readonly string[] = [
  // Danfo: a bus with windows and two wheels.
  "M4 16V8.5A1.5 1.5 0 0 1 5.5 7H16l3.5 4V16M4 12h15.5M8 7v5M12 7v5M6 16.5a1.5 1.5 0 1 0 3 0M15 16.5a1.5 1.5 0 1 0 3 0",
  // Keke: a tricycle with a canopy.
  "M5 15h11l2-4h-3l-1-4H7L5 11zM7 7c1-1.5 6-1.5 7 0M7 17.5a1.5 1.5 0 1 0 0-.1M16 17.5a1.5 1.5 0 1 0 0-.1",
  // Okada: a motorbike.
  "M6 17a3 3 0 1 0 0-.1M18 17a3 3 0 1 0 0-.1M6 17l4-6h4l4 6M12 11l1-3h3M9 11h-2",
  // Generator: a box with a handle and a dial.
  "M5 9h14v9H5zM8 9V6h8v3M9 13.5a1.5 1.5 0 1 0 0-.1M14 12h3M14 15h3M7 18v1.5M17 18v1.5",
  // Jollof pot: a pot with a lid and handles.
  "M5 11h14v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM3 12h2M19 12h2M7 11a5 2 0 0 1 10 0M12 7v2",
  // Gele: a fanned head-tie over a face.
  "M12 20a4 4 0 0 0 4-4v-2H8v2a4 4 0 0 0 4 4zM6 13c-1-3 1-7 6-8 5 1 7 5 6 8M8 11c1-2 7-2 8 0M10 7l2-3 2 3",
  // Talking drum: an hourglass drum with cords.
  "M6 5h12M6 19h12M7 5l4 7-4 7M17 5l-4 7 4 7M9 5v14M15 5v14",
  // Football: a ball with a patch.
  "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9l3 2-1 3.5h-4L9 11zM12 9V5M15 11l3.5-1M14 14.5l2 3M10 14.5l-2 3M9 11l-3.5-1",
];

export const tokenColour = (seat: number) => TOKEN_COLOURS[seat % 8] as string;

/** A player's token: their colour, their Naija thing. */
export function Token({ seat, size }: { seat: number; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size ?? "100%"}
      height={size ?? "100%"}
      aria-hidden="true"
      className="block"
    >
      <circle cx="12" cy="12" r="11.5" fill={tokenColour(seat)} stroke="#fff" strokeWidth="1.2" />
      <path
        d={ICONS[seat % 8]}
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(2.4 2.4) scale(0.8)"
      />
    </svg>
  );
}
