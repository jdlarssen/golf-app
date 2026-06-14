/**
 * Helpers for reading Next.js route `searchParams`. Extracted in #611 from the
 * login + complete-profile pages, which shared the same param-parsing
 * boilerplate (the page bodies themselves are unrelated and stay separate).
 */

/** First value of a possibly-repeated query param, or `undefined`. */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Map a raw `?error=` value onto a known error code. A present-but-unrecognised
 * value collapses to `fallback`; an absent value returns `undefined` (nothing to
 * show). The caller resolves the message with its own typed translator
 * (`t(\`errors.${code}\`)`) so next-intl's key typing stays intact.
 */
export function resolveErrorCode<C extends string>(
  raw: string | undefined,
  knownCodes: ReadonlySet<C>,
  fallback: C,
): C | undefined {
  if (!raw) return undefined;
  return knownCodes.has(raw as C) ? (raw as C) : fallback;
}
