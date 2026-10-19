'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useOnline } from '@/hooks/useOnline';
import { PLAYED_PARAM, reloadPage } from './reloadPage';

export const CEREMONY_POLL_MS = 2000;
/**
 * After six hours without a change the TV asks once a minute instead, so a
 * TV left on overnight costs little; a change brings back the 2 s pace.
 */
export const CEREMONY_SLOW_AFTER_MS = 6 * 60 * 60 * 1000;
export const CEREMONY_SLOW_POLL_MS = 60_000;
/**
 * How long a `router.refresh()` gets to put the new step on screen before
 * the page reloads instead.
 *
 * On this route (PPR under cacheComponents, Next 16.2.6) a refresh now and
 * then never reaches the screen. Measured on staging (#2298): 3 of 12
 * refreshes, each with the RSC payload read in full and correct (the bytes
 * of the target step, no stream error) and no error anywhere: the client
 * router dropped the commit. A second refresh landed in 2 of 3 cases; a
 * reload landed every time. Next's docs describe no such case.
 *
 * Telling a slow refresh from a dropped one through `startTransition` does
 * not work: in Next 16 `router.refresh()` queues the work in the router's
 * own action queue and returns at once, so the caller's transition ends
 * before the RSC answer arrives. Measured on staging: all 12 of 12 steps
 * reloaded, and half did not land within 12 s. So a plain timer it is. A
 * reload never replays a reveal: it carries the step already shown
 * (`reloadPage`), and the server draws those cards still.
 */
export const CEREMONY_LAND_MS = 1500;

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
  // Read through a ref: a re-render must not restart the loop.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const online = useOnline();
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, isVisibleOnServer);
  // What a refresh was asked for, and when, so a slow refresh is not asked
  // for again on every tick while the page catches up.
  const awaiting = useRef<{ target: Target; at: number } | null>(null);
  // When the page last changed; six quiet hours slow the pace down.
  const changedAt = useRef<number | null>(null);
  // 404s in a row: one is a blink, two mean the link is gone.
  const misses = useRef(0);

  // A new step on screen is a change, and lands whatever was awaited for it.
  useEffect(() => {
    changedAt.current = Date.now();
    awaiting.current = null;
  }, [step]);

  useEffect(() => {
    if (!online || !visible) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let landCheck: ReturnType<typeof setTimeout> | undefined;

    // The step never came: a reload lands every time, and it carries the
    // step on screen so nothing already shown animates again.
    const reload = () => {
      cancelled = true;
      clearTimeout(timer);
      reloadPage(step);
    };

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
      // After a fallback reload the URL says which cards were already shown
      // (`?vist=`). A step back below that mark (back, «Start på nytt»,
      // «Lukk») reloads with the lower mark, so the next reveal animates.
      const mark = Number(new URLSearchParams(window.location.search).get(PLAYED_PARAM) ?? NaN);
      if (Number.isInteger(mark) && typeof target !== 'string' && (target ?? 0) < mark) {
        cancelled = true;
        reloadPage(target);
        return;
      }
      const pending = awaiting.current;
      if (pending?.target === target) {
        if (Date.now() - pending.at >= CEREMONY_LAND_MS) reload();
        return;
      }
      awaiting.current = { target, at: Date.now() };
      routerRef.current.refresh();
      // Landed, the new step restarts this effect and clears the check.
      landCheck = setTimeout(reload, CEREMONY_LAND_MS);
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
      clearTimeout(landCheck);
    };
  }, [online, visible, token, step]);

  return null;
}
