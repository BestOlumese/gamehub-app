/**
 * Indexed read for code that has already established the index is valid.
 * Throws on a programming error; rule violations go through `Result`, never here.
 */
export function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`invariant: index ${i} out of range (length ${arr.length})`);
  return v;
}
