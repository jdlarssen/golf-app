/**
 * PostgREST sends an `.in('id', ids)` filter in the request URL, about 37
 * bytes per uuid. Past roughly 200–400 ids the request fails (staging probe
 * for #2214; the inbox hit it with 480 unread signup requests, #2263). Every
 * `.in()` the inbox sends with a list it does not control goes through here in
 * slices of `IN_CHUNK`.
 */
export const IN_CHUNK = 100;

/** Distinct ids in slices of at most `size`. */
export function chunkIds<T>(ids: readonly T[], size = IN_CHUNK): T[][] {
  const unique = [...new Set(ids)];
  const out: T[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}

/**
 * Runs `read` once per slice of `ids` and joins the rows. The first error is
 * thrown as it came, so a page sends it to its error boundary (#1392) instead
 * of treating a failed slice as «no rows».
 */
export async function readInChunks<R>(
  ids: readonly string[],
  read: (slice: string[]) => PromiseLike<{ data: R[] | null; error: unknown }>,
): Promise<R[]> {
  const results = await Promise.all(chunkIds(ids).map((slice) => read(slice)));
  const rows: R[] = [];
  for (const { data, error } of results) {
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}
