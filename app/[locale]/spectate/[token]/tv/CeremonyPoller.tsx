'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useOnline } from '@/hooks/useOnline';
import { reloadPage } from './reloadPage';

export const CEREMONY_POLL_MS = 2000;
/**
 * A TV left on overnight stops asking 6 hours after the page was opened; a
 * reload starts it again. Counted from the load, not from the game's end: a
 * prize-giving in the evening after a morning round must still reach a TV.
 */
export const CEREMONY_POLL_GIVE_UP_MS = 6 * 60 * 60 * 1000;
/**
 * How long a `router.refresh()` gets to land before the page reloads instead.
 *
 * On this route (PPR under cacheComponents, Next 16.2.6) a refresh now and
 * then never reaches the screen. Measured on staging (#2298): 3 of 12
 * refreshes, each with the RSC payload read in full and correct (the bytes
 * of the target step, no stream error), and no error anywhere. The client
 * router dropped the commit. A second refresh landed in 2 of 3 cases; a
 * reload landed every time. Next's docs describe no such case, so the poller
 * checks that the step arrived and reloads when it did not.
 */
export const CEREMONY_LAND_MS = 1500;

function subscribeVisibility(callback: () => void): () => void {
  document.addEventListener('visibilitychange', callback);
  return () => document.removeEventListener('visibilitychange', callback);
}
const isVisible = () => document.visibilityState !== 'hidden';
const isVisibleOnServer = () => true;

/**
 * The big screen's ear for the prize-giving (#2298). The TV is anonymous, so
 * it cannot listen on realtime; it asks the step route every 2 s and calls
 * `router.refresh()` only when the step differs from the one on screen, or
 * when the link is gone (404). Mounted on a finished game in a podium format,
 * on «Ferdig spilt» too, so «Start premieutdelingen» reaches it.
 *
 * Quiet without network and while the tab is hidden, and asks at once when
 * either comes back. Gives up 6 hours after the page was opened so a
 * forgotten TV does not use up the hosting quota.
 */
export function CeremonyPoller({ token, step }: { token: string; step: number | null }) {
  const router = useRouter();
  const online = useOnline();
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, isVisibleOnServer);
  // When the page was opened; set once, in the effect.
  const mountedAt = useRef<number | null>(null);
  // The step a refresh was already asked for, so a slow refresh is not
  // asked for again on every tick while the page catches up.
  const requested = useRef<number | null | undefined>(undefined);
  const requestedAt = useRef(0);

  useEffect(() => {
    requested.current = undefined;
  }, [step]);

  useEffect(() => {
    if (!online || !visible) return;
    mountedAt.current ??= Date.now();
    const giveUpAt = mountedAt.current + CEREMONY_POLL_GIVE_UP_MS;
    if (Date.now() >= giveUpAt) return;

    let cancelled = false;
    let inFlight = false;
    let landCheck: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      if (cancelled) return;
      if (Date.now() >= giveUpAt) {
        clearInterval(id);
        return;
      }
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/spectate/${token}/seremoni`, { cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 404) {
          router.refresh();
          return;
        }
        if (!res.ok) return;
        const body = (await res.json()) as { step: number | null };
        if (cancelled || body.step === step) return;
        if (body.step === requested.current) {
          // Asked for already; reload if it has not landed in time.
          if (Date.now() - requestedAt.current >= CEREMONY_LAND_MS) {
            cancelled = true;
            clearInterval(id);
            reloadPage();
          }
          return;
        }
        requested.current = body.step;
        requestedAt.current = Date.now();
        router.refresh();
        landCheck = setTimeout(tick, CEREMONY_LAND_MS);
      } catch {
        // A blip; the next tick asks again.
      } finally {
        inFlight = false;
      }
    }

    void tick();
    const id = setInterval(tick, CEREMONY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(landCheck);
    };
  }, [online, visible, token, step, router]);

  return null;
}
