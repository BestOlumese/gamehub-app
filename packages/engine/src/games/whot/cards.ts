// The Nigerian standard Whot pack (54 cards). Card ids: "circle-7", "whot-20-a".

export const SHAPES = ["circle", "triangle", "cross", "square", "star"] as const;
export type Shape = (typeof SHAPES)[number];
export type CardShape = Shape | "whot";

const NUMBERS: Record<Shape, readonly number[]> = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
};

export const DECK: readonly string[] = [
  ...SHAPES.flatMap((shape) => NUMBERS[shape].map((n) => `${shape}-${n}`)),
  ...["a", "b", "c", "d", "e"].map((x) => `whot-20-${x}`),
];

export type Card = { shape: CardShape; n: number };

export function parseCard(id: string): Card {
  const [shape, n] = id.split("-");
  return { shape: shape as CardShape, n: Number(n) };
}

/** Points left in a hand when the game is counted: stars double, Whot 20. */
export function cardValue(id: string): number {
  const c = parseCard(id);
  if (c.shape === "whot") return 20;
  return c.shape === "star" ? c.n * 2 : c.n;
}

export const handTotal = (hand: readonly string[]) =>
  hand.reduce((sum, id) => sum + cardValue(id), 0);

/** Cards that do something (when their rule is on). */
export const isSpecialNumber = (n: number) =>
  n === 1 || n === 2 || n === 5 || n === 8 || n === 14 || n === 20;
