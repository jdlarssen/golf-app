'use client';

import { useSyncExternalStore } from 'react';

/**
 * Subscribes to the browser's connectivity events. Both `online` and
 * `offline` invalidate the snapshot — `navigator.onLine` is the store, the
 * events are just the change notification.
 */
function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

const getSnapshot = () => navigator.onLine;

/**
 * SSR/first-hydration snapshot: assume online. Anything gated on this hook
 * therefore renders its online shape on the server, so hydration never
 * flashes an offline state that the client immediately corrects.
 */
const getServerSnapshot = () => true;

/**
 * Shared `navigator.onLine` hook (#1376) — the React-idiomatic way to read a
 * browser store that changes outside React.
 *
 * Consumers: `GreenPinChip` (hides the chip offline) and `useSpectatePolling`
 * (pauses the spectate poll offline).
 *
 * Caveat, accepted deliberately: `navigator.onLine` is optimistic. It reports
 * "online" for a captive portal or a dead uplink as long as the interface is
 * up. A fetch heartbeat would be more truthful but is out of scope here — the
 * failure mode (a stale page that still claims to be live) is exactly what it
 * was before, so this is never a regression.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, getSnapshot, getServerSnapshot);
}
