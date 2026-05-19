/**
 * Indexed array access guaranteed in-bounds by the caller. Centralized so
 * the non-null assertion required by `noUncheckedIndexedAccess` lives in one
 * place rather than on every read in the inner DP loop.
 */
function at(arr: ReadonlyArray<number>, i: number): number {
  // biome-ignore lint/style/noNonNullAssertion: caller guarantees i is in [0, arr.length)
  return arr[i]!;
}

/** Levenshtein distance between two strings. Iterative DP, O(m*n). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(at(curr, j - 1) + 1, at(prev, j) + 1, at(prev, j - 1) + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return at(prev, n);
}

/**
 * Returns the closest candidate within `maxDistance` edits, or null.
 * Ties broken by candidate order (first match wins).
 */
export function closestMatch(
  input: string,
  candidates: ReadonlyArray<string>,
  maxDistance = 3,
): string | null {
  let best: { value: string; distance: number } | null = null;
  for (const c of candidates) {
    const d = levenshtein(input, c);
    if (d <= maxDistance && (best === null || d < best.distance)) {
      best = { value: c, distance: d };
    }
  }
  return best?.value ?? null;
}
