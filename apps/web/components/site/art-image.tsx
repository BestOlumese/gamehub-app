type ArtName =
  | "hero-table"
  | "envelope"
  | "game-whot"
  | "game-ludo"
  | "game-snakes"
  | "game-tictactoe"
  | "game-rps"
  | "game-chess"
  | "game-draughts";

const SIZES: Record<ArtName, [number, number]> = {
  "hero-table": [520, 420],
  envelope: [160, 120],
  "game-whot": [160, 110],
  "game-ludo": [160, 110],
  "game-snakes": [160, 110],
  "game-tictactoe": [160, 110],
  "game-rps": [160, 110],
  "game-chess": [160, 110],
  "game-draughts": [160, 110],
};

/** Decorative SVG from public/art. Plain <img>: static vector art needs no optimizer or client JS. */
export function ArtImage({
  name,
  className,
  lazy,
}: {
  name: ArtName;
  className?: string;
  lazy?: boolean;
}) {
  const [width, height] = SIZES[name];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/art/${name}.svg`}
      width={width}
      height={height}
      alt=""
      className={className}
      loading={lazy ? "lazy" : undefined}
      decoding="async"
    />
  );
}
