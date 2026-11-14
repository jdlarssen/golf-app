/**
 * PostgREST puts an `.in()` list in the URL, and the URL has a cap (about 200–400 uuids).
 * A season of all Tørny's games can outgrow it, so id lists are read in slices of this size.
 */
export const IN_LIST_CHUNK = 100;

/** `items` cut into slices of at most `size`, in order. */
export function chunks<T>(items: readonly T[], size: number = IN_LIST_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
