'use client';

import { useEffect } from 'react';

/**
 * Keeps the screen awake while the component is mounted (#2275: the big
 * screen in the clubhouse must not go to sleep). The browser drops the lock
 * when the tab is hidden, so it is asked for again when the page shows. Every
 * failure (no Wake Lock API, a refused request) is ignored: the page works the
 * same, the screen may just dim.
 */
export function useScreenWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let active = true;

    async function request() {
      try {
        const next = await navigator.wakeLock?.request('screen');
        if (!next) return;
        if (active) lock = next;
        else void next.release().catch(() => {});
      } catch {
        // Not supported or refused (battery saver, permissions policy).
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void request();
    }

    void request();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void lock?.release().catch(() => {});
      lock = null;
    };
  }, []);
}
