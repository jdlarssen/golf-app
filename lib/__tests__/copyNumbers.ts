// Shared helper for the copy-parity checks in the DB-CHECK agreement tests
// (#2222). Not a test file: vitest collects only `*.test.*`.

/**
 * Matches `n` as a whole number in a message: not as part of a longer one.
 * A plain `toContain('4')` would pass on «40» and miss a limit raised from 4
 * to 40 with the copy left behind; `-1` must not pass on «-10» either.
 */
export function wholeNumber(n: number): RegExp {
  const digits = String(n).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  return new RegExp(`(?<!\\d)${digits}(?!\\d)`);
}
