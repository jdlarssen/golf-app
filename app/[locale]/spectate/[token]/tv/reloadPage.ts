/**
 * A full reload of the big screen (#2298). Its own module so the poller's
 * test can stand in for it; jsdom cannot reload.
 */
export function reloadPage(): void {
  window.location.reload();
}
