import { first } from './searchParams';

/**
 * Origin marker for pages opened from the Klubbhuset tab (#2487). Klubbhuset is
 * a bottom-nav tab, so a page you open from it (Baner, Spillformater, a club)
 * goes back to the tab instead of to Hjem or a list you never passed through.
 *
 * `kilde` rather than `fra`: `?fra=` already means «rematch from game id» on
 * /opprett-spill.
 */
export const KLUBBHUS_ORIGIN_PARAM = 'kilde';
const KLUBBHUS_ORIGIN_VALUE = 'klubbhuset';

/** `href` with `kilde=klubbhuset` appended (`?` or `&` as needed). */
export function withKlubbhusOrigin(href: string): string {
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}${KLUBBHUS_ORIGIN_PARAM}=${KLUBBHUS_ORIGIN_VALUE}`;
}

/** Back target for a page that may have been opened from Klubbhuset. */
export function klubbhusBackHref(
  raw: string | string[] | undefined,
  fallback: string,
): string {
  return first(raw) === KLUBBHUS_ORIGIN_VALUE ? '/admin' : fallback;
}
