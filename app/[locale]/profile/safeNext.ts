/**
 * Validate a ?next= redirect target before sending the user there.
 *
 * Accepts only same-origin paths (must start with a single `/`). Rejects
 * protocol-relative URLs (`//evil.com/…`), absolute URLs, fragment-only
 * values, and any non-string input — anything that could turn the
 * post-save redirect into an open redirect.
 */
export function safeNextPath(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  return raw;
}
