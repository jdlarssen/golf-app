/**
 * Exact, case-insensitive e-post match for a PostgREST filter (#2207):
 *
 *   .filter('email', 'imatch', emailMatchPattern(normalized))
 *
 * `imatch` is PostgREST's `~*`. Anchored and fully escaped, it means the same
 * as the database's own `lower(a) = lower(b)` (email_is_invited, the
 * invitations accept policy), so the rule has one meaning in both places.
 *
 * Why not `ilike`: there `_` and `%` are wildcards, so `ola.n@…` also finds
 * `ola_n@…`, and PostgREST turns `*` into `%` inside like/ilike, so a `*` in an
 * address cannot be matched literally at all. Why not `.eq`: stored addresses
 * are not guaranteed to be lower case (older rows), and `imatch` does not care.
 */
export function emailMatchPattern(email: string): string {
  return `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}
