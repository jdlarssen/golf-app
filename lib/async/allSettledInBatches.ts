/**
 * `Promise.allSettled` with a ceiling on how many calls are in flight at once.
 *
 * Runs `fn` over `items` in sequential batches of `batchSize`: batch N+1 only
 * starts once every promise in batch N has settled. The returned array is flat
 * and index-aligned with `items` — `result[i]` belongs to `items[i]` — so
 * callers can keep matching results against their own recipient list by
 * position, exactly as with a plain `Promise.allSettled(items.map(...))`.
 *
 * Used by the best-effort notification fan-outs (#1544): a club-scale cup has
 * ~150 participants, and firing one DB insert plus one mail per participant in
 * a single burst risks a Vercel timeout mid-flight, leaving the field partly
 * notified. Batching trades a little wall-clock time for a bounded burst.
 *
 * Rejections are contained the same way `Promise.allSettled` contains them: a
 * rejected item never stops its own batch, and never stops later batches.
 *
 * `batchSize` is clamped to a whole number >= 1 (0, negatives, fractions and
 * NaN all become 1) rather than validated — these are best-effort paths, and a
 * bad size must never throw where a notification would otherwise have been
 * sent.
 */
export async function allSettledInBatches<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
  batchSize = 20,
): Promise<PromiseSettledResult<R>[]> {
  const size = Number.isFinite(batchSize) ? Math.max(1, Math.floor(batchSize)) : 1;

  const results: PromiseSettledResult<R>[] = [];
  for (let start = 0; start < items.length; start += size) {
    const batch = items.slice(start, start + size);
    // The `async` wrapper turns a synchronous throw from `fn` into a rejected
    // result too, so one bad item cannot abort the whole run.
    const settled = await Promise.allSettled(batch.map(async (item) => fn(item)));
    results.push(...settled);
  }
  return results;
}
