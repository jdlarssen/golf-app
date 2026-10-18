'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useOnline } from '@/hooks/useOnline';

export const CEREMONY_POLL_MS = 2000;
/** A TV left on overnight stops asking; a reload starts it again. */
export const CEREMONY_POLL_GIVE_UP_MS = 6 * 60 * 60 * 1000;

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
 * either comes back. Gives up 6 hours after the game ended so a forgotten TV
 * does not use up the hosting quota.
 */
export function CeremonyPoller({
  token,
  step,
  endedAt,
}: {
  token: string;
  step: number | null;
  endedAt: string | null;
}) {
  const router = useRouter();
  const online = useOnline();
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, isVisibleOnServer);
  // The mount time stands in for a missing end time; set once, in the effect.
  const mountedAt = useRef<number | null>(null);
  // The step a refresh was already asked for, so a slow refresh is not
  // asked for again on every tick while the page catches up.
  const requested = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    requested.current = undefined;
  }, [step]);

  useEffect(() => {
    if (!online || !visible) return;
    mountedAt.current ??= Date.now();
    const ended = endedAt ? Date.parse(endedAt) : NaN;
    const giveUpAt = (Number.isNaN(ended) ? mountedAt.current : ended) + CEREMONY_POLL_GIVE_UP_MS;
    if (Date.now() >= giveUpAt) return;

    let cancelled = false;
    let inFlight = false;

    async function tick() {
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
        if (cancelled || body.step === step || body.step === requested.current) return;
        requested.current = body.step;
        router.refresh();
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
    };
  }, [online, visible, endedAt, token, step, router]);

  return null;
}
