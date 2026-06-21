/**
 * Handicap allowance defaults and parser for cup match formats (#809).
 *
 * ALLOWANCE_DEFAULTS are the WHS-standard allowance percentages for each
 * 2v2 matchplay format. They are the single source of truth — previously
 * they were double-encoded as five separate parse* functions in
 * lib/cup/actions.ts and as five DEFAULT_*_ALLOWANCE constants in the
 * generer actions file.
 *
 * parseAllowancePct handles form-field input: empty → use the supplied
 * default, valid integer 0..100 → return it, anything else → null (caller
 * should surface a validation error).
 */

export const ALLOWANCE_DEFAULTS = {
  /** WHS default for fourball (best ball) matchplay: each player 85% of handicap. */
  fourball: 85,
  /** WHS default for foursomes (alternate shot) matchplay: 50% of combined diff. */
  foursomes: 50,
  /** WHS default for greensome matchplay: 100% per player. */
  greensome: 100,
  /** WHS default for chapman (pinehurst) matchplay: 100% per player. */
  chapman: 100,
  /** WHS default for gruesome matchplay: 50% (opponent picks ball, like foursomes). */
  gruesome: 50,
} as const;

export type AllowanceFormat = keyof typeof ALLOWANCE_DEFAULTS;

/**
 * Parses an allowance percentage from a form field value.
 *
 * - Empty / whitespace-only → returns `defaultPct` (safe fallback when form
 *   submits with stale state; the UI toggle should always send an explicit value).
 * - Valid integer in [0, 100] → returns the integer (0 = brutto, 1–100 = netto).
 * - Anything else → returns `null` (validation failure; caller handles the error).
 */
export function parseAllowancePct(
  raw: string,
  defaultPct: number,
): number | null {
  const cleaned = raw.trim();
  if (cleaned === '') return defaultPct;
  const n = Number(cleaned);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}
