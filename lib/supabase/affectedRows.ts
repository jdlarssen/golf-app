/**
 * Shared helpers for asserting that a Supabase mutation actually touched rows.
 *
 * Motivating bugs:
 *   #667 — silent 0-row writes caused by stale RLS policies went undetected in
 *           production, leaving data in an inconsistent state.
 *   #704 — `approveScorecard` returned success to the caller even when the
 *           UPDATE matched 0 game_players rows (wrong status filter), because
 *           the caller never inspected `data.length`.
 *
 * Usage:
 *   const [row] = expectAffected(
 *     await sb.from('game_players').update({...}).eq('id', id).select(),
 *     'approveScorecard',
 *   )
 */

/**
 * Thrown when a Supabase mutation completes without error but affects 0 rows.
 * Catching this type lets call-sites distinguish "DB refused" (plain Error)
 * from "write silently no-oped" (NoRowsAffectedError) if they need to.
 */
export class NoRowsAffectedError extends Error {
  override name = 'NoRowsAffectedError'

  constructor(context: string) {
    super(`${context}: write affected 0 rows`)
    // Restore prototype chain for instanceof checks in transpiled environments.
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Assert that a Supabase mutation result has no error and affected at least one row.
 *
 * Motivating bugs: #667, #704
 *
 * @param result  The object returned by a `.select()`-terminated Supabase mutation.
 *                Typed structurally so `PostgrestError` fits without importing it.
 * @param context A short label used as the prefix in thrown error messages,
 *                e.g. `'approveScorecard'`.
 * @returns The non-empty `data` array.
 *
 * @throws {Error}               If `result.error` is set (`${context}: ${message}`).
 * @throws {NoRowsAffectedError} If `data` is null or empty.
 *
 * Usage:
 *   const [row] = expectAffected(
 *     await sb.from('game_players').update({...}).eq('id', id).select(),
 *     'approveScorecard',
 *   )
 */
export function expectAffected<T>(
  result: { data: T[] | null; error: { message: string } | null },
  context: string,
): T[] {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`)
  }
  const data = result.data
  if (!data || data.length === 0) {
    throw new NoRowsAffectedError(context)
  }
  return data
}

/**
 * Assert that a Supabase mutation result has no error and affected exactly one row.
 *
 * Motivating bugs: #667, #704
 *
 * @param result  The object returned by a `.select()`-terminated Supabase mutation.
 * @param context A short label used as the prefix in thrown error messages.
 * @returns The single affected row.
 *
 * @throws {Error}               If `result.error` is set or more than 1 row returned.
 * @throws {NoRowsAffectedError} If `data` is null or empty.
 *
 * Usage:
 *   const row = expectOne(
 *     await sb.from('game_players').update({...}).eq('id', id).select(),
 *     'approveScorecard',
 *   )
 */
export function expectOne<T>(
  result: { data: T[] | null; error: { message: string } | null },
  context: string,
): T {
  const rows = expectAffected(result, context)
  if (rows.length !== 1) {
    throw new Error(`${context}: expected exactly 1 row, got ${rows.length}`)
  }
  return rows[0]
}
