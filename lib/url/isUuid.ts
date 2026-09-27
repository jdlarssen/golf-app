// UUID shape: 8-4-4-4-12 hex groups separated by hyphens.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when a route segment has the shape of a UUID. A hand-typed id that
 * doesn't is a missing page (`notFound()`), not a Postgres `22P02` crash on
 * the root error page (#2244).
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
