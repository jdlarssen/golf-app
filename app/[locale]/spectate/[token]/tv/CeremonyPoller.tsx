'use client';

import { useEffect, useRef, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useOnline } from '@/hooks/useOnline';
import { reloadPage } from './reloadPage';

export const CEREMONY_POLL_MS = 2000;
/**
 * After six hours without a change the TV asks once a minute instead, so a
 * TV left on overnight costs little; a change brings back the 2 s pace.
 */
export const CEREMONY_SLOW_AFTER_MS = 6 * 60 * 60 * 1000;
export const CEREMONY_SLOW_POLL_MS = 60_000;
/**
 * The longest a `router.refresh()` may stay pending before the page reloads.
 *
 * On this route (PPR under cacheComponents, Next 16.2.6) a refresh now and
 * then never reaches the screen. Measured on staging (#2298): 3 of 12
 * refreshes, each with the RSC payload read in full and correct (the bytes
 * of the target step, no stream error) and no error anywhere: the client
 * router ended the work without committing it. A second refresh landed in 2
 * of 3 cases; a reload landed every time. Next's docs describe no such case.
 *
 * So the refresh runs in a transition, and the poller reloads only when that
 * transition is over and the old step is still on screen: a dropped refresh.
 * A slow one is waited for (a reload would replay the reveal and the
 * confetti), up to this ceiling for one that hangs.
 */
export const CEREMONY_REFRESH_CEILING_MS = 10_000;

function subscribeVisibility(callback: () => void): () => void {
  document.addEventListener('visibilitychange', callback);
  return () => document.removeEventListener('visibilitychange', callback);
}
const isVisible = () => document.visibilityState !== 'hidden';
const isVisibleOnServer = () => true;

/** What the page should show: a step (or null = off), or that it must leave. */
type Target = number | null | 'reopened' | 'gone';

/**
 * The big screen's ear for the prize-giving (#2298). The TV is anonymous, so
 * it cannot listen on realtime; it asks the step route every 2 s and calls
 * `router.refresh()` only when the page shows something else: another step,
 * a game that is no longer finished (reopened), or a link that is gone (two
 * 404s in a row; one is a blink). Mounted on a finished game in a podium
 * format, on «Ferdig spilt» too, so «Start premieutdelingen» reaches it.
 *
 * Quiet without network and while the tab is hidden, and asks at once when
 * either comes back.
 */
export function CeremonyPoller({ token, step }: { token: string; step: number | null }) {
  const router = useRouter();
  // Read through a ref: the refresh's own renders must not restart the loop.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const online = useOnline();
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, isVisibleOnServer);
  const [refreshing, startRefresh] = useTransition();
  // The refresh in flight: what it should bring, and when it was asked for.
  const awaiting = useRef<{ target: Target; at: number } | null>(null);
  // When the page last changed; six quiet hours slow the pace down.
  const changedAt = useRef<number | null>(null);
  // 404s in a row: one is a blink, two mean the link is gone.
  const misses = useRef(0);

  // A new step on screen is a change, and lands whatever was awaited for it.
  useEffect(() => {
    changedAt.current = Date.now();
    if (awaiting.current?.target === step) awaiting.current = null;
  }, [step]);

  // The refresh's transition is over. Still the old step: the router dropped
  // it, and a reload is the one way that always lands.
  useEffect(() => {
    if (refreshing || awaiting.current === null) return;
    if (awaiting.current.target === step) {
      awaiting.current = null;
      return;
    }
    awaiting.current = null;
    reloadPage();
  }, [refreshing, step]);

  useEffect(() => {
    if (!online || !visible) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      const res = await fetch(`/api/spectate/${token}/seremoni`, { cache: 'no-store' });
      if (cancelled) return;
      let target: Target;
      if (res.status === 404) {
        misses.current += 1;
        if (misses.current < 2) return;
        target = 'gone';
      } else {
        misses.current = 0;
        if (!res.ok) return;
        const body = (await res.json()) as { step: number | null; finished: boolean };
        // A reopened game is no longer «Ferdig spilt»: the page must leave it.
        target = body.finished ? body.step : 'reopened';
      }
      if (cancelled || target === step) return;
      changedAt.current = Date.now();
      const pending = awaiting.current;
      if (pending?.target === target) {
        // Asked for already and still working: wait, unless it hangs.
        if (Date.now() - pending.at >= CEREMONY_REFRESH_CEILING_MS) {
          cancelled = true;
          reloadPage();
        }
        return;
      }
      awaiting.current = { target, at: Date.now() };
      startRefresh(() => routerRef.current.refresh());
    }

    async function loop() {
      try {
        await tick();
      } catch {
        // A blip; the next tick asks again.
      }
      if (cancelled) return;
      const quiet = Date.now() - (changedAt.current ?? Date.now()) >= CEREMONY_SLOW_AFTER_MS;
      timer = setTimeout(loop, quiet ? CEREMONY_SLOW_POLL_MS : CEREMONY_POLL_MS);
    }

    void loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [online, visible, token, step]);

  return null;
}
