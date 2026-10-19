/** The query key that carries the step already animated across a reload. */
export const PLAYED_PARAM = 'vist';

/**
 * A full reload of the big screen (#2298), carrying the step already shown
 * as `?vist=` so the server renders those cards still and only new ones
 * animate: a reload never replays a reveal or the confetti. Its own module
 * so the poller's test can stand in for it; jsdom cannot reload.
 */
export function reloadPage(played: number | null): void {
  const url = new URL(window.location.href);
  if (played === null) url.searchParams.delete(PLAYED_PARAM);
  else url.searchParams.set(PLAYED_PARAM, String(played));
  window.location.replace(url.toString());
}
