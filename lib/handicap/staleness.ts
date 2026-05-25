export const HANDICAP_STALENESS_WEEKS = 4;
export const HANDICAP_STALENESS_MS =
  HANDICAP_STALENESS_WEEKS * 7 * 24 * 60 * 60 * 1000;

/**
 * True when the player should be prompted to confirm their handicap.
 *
 * Returns true if `updatedAt` is missing or older than
 * HANDICAP_STALENESS_WEEKS. Boundary case (exactly N weeks old) is
 * considered stale — the alternative would force a meaningless
 * 1-millisecond distinction.
 *
 * The `now` parameter exists for deterministic tests; production callers
 * leave it default.
 */
export function isHandicapStale(
  updatedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!updatedAt) return true;
  const updated =
    typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  return now.getTime() - updated.getTime() >= HANDICAP_STALENESS_MS;
}
