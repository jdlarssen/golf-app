'use client';

import { useSpectatePolling, SPECTATE_POLL_INTERVAL_MS } from './useSpectatePolling';

/**
 * Invisible client island that keeps an embed fresh while the game is active.
 * All behavior lives in `useSpectatePolling`; this component is the mounting
 * point for surfaces that want the polling without any status UI.
 *
 * The spectate page itself does NOT mount this — it renders
 * `SpectateLiveStatus`, which drives the same hook and also shows the state.
 * One polling owner per page.
 *
 * Consumers: the two embed pages (`/embed/spill`, `/embed/liga`). They keep
 * their existing markup; since #1376 they inherit the connectivity behavior
 * (pause offline, immediate refresh on reconnect) without any UI change.
 */
export function SpectatePoller({
  live,
  intervalMs = SPECTATE_POLL_INTERVAL_MS,
}: {
  live: boolean;
  /** #1024: liga-embedden poller roligere (60 s) — sesongtabellen endres sjelden. */
  intervalMs?: number;
}) {
  useSpectatePolling(live, intervalMs);

  // Renders nothing — purely a side-effect island.
  return null;
}
