/** Each seat's token: what they picked in the lobby, else the first free one in seat order. */
export function tokensFor(seats: ReadonlyArray<{ token?: number | null }>): number[] {
  const taken = new Set(seats.flatMap((s) => (typeof s.token === "number" ? [s.token] : [])));
  let next = 0;
  return seats.map((s) => {
    if (typeof s.token === "number") return s.token;
    while (taken.has(next)) next++;
    taken.add(next);
    return next++ % 8;
  });
}
