const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

/** Place labels; seats that tie share one ("=2nd"). */
export function placeLabels(places: number[][]) {
  const out = new Map<number, string>();
  let at = 0;
  for (const group of places) {
    for (const seat of group) out.set(seat, `${group.length > 1 ? "=" : ""}${ORD[at] ?? ""}`);
    at += group.length;
  }
  return out;
}
