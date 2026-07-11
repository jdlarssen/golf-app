'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { InstallInstructionsModal } from './InstallInstructionsModal';

const DISMISS_KEY = 'torny-install-banner-dismissed';
const DISMISS_EVENT = 'torny-install-banner-change';

// #1186 — value-first timing (contract trigger (a)): give value before you ask.
// A pure client-side counter of logged-in Home visits, no server plumbing.
// The banner stays hidden on the very first Home visit and only appears from
// the 2nd visit on, mirroring PushNudge's "ask after value" philosophy. This is
// an additive AND gate — the standalone/dismiss/anti-flash logic is unchanged.
const VISITS_KEY = 'torny-home-visits';
const BANNER_MIN_VISIT = 2; // first shown on the 2nd logged-in Home visit

const subscribe = (cb: () => void) => {
  window.addEventListener(DISMISS_EVENT, cb);
  return () => window.removeEventListener(DISMISS_EVENT, cb);
};
const getSnapshot = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};
// SSR + first hydration render return `true` so the banner doesn't flash
// before localStorage is read. After hydration React switches to getSnapshot.
const getServerSnapshot = () => true;

// Visit store (#1186). Read the Home-visit count the same reactive way as the
// dismiss flag so the reveal survives the increment below without setState.
const VISITS_EVENT = 'torny-home-visits-change';
const visitSubscribe = (cb: () => void) => {
  window.addEventListener(VISITS_EVENT, cb);
  return () => window.removeEventListener(VISITS_EVENT, cb);
};
const getVisitSnapshot = () => {
  try {
    return (Number(localStorage.getItem(VISITS_KEY)) || 0) >= BANNER_MIN_VISIT;
  } catch {
    return true; // storage blocked (private mode) — fail open, show as before
  }
};
// SSR + first hydration render return `false` (hidden) so the banner never
// flashes before the client-side visit count is read.
const getVisitServerSnapshot = () => false;

export function InstallBanner() {
  const t = useTranslations('installBanner');
  const { status, install } = useInstallPrompt();
  const dismissed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  // Visit gate (#1186). Read the count reactively so the banner reveals after
  // the increment effect below fires, with no SSR flash.
  const passedVisitGate = useSyncExternalStore(
    visitSubscribe,
    getVisitSnapshot,
    getVisitServerSnapshot,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const countedRef = useRef(false);

  useEffect(() => {
    // Count this mount as one Home visit. Guard against React StrictMode's
    // double-invoked effect (dev/staging run `next dev`) so a single mount is
    // exactly one visit. Only touches localStorage + notifies the visit store —
    // no setState here; the store read above drives the reveal.
    if (countedRef.current) return;
    countedRef.current = true;
    try {
      const priorVisits = Number(localStorage.getItem(VISITS_KEY)) || 0;
      localStorage.setItem(VISITS_KEY, String(priorVisits + 1));
    } catch {
      // Storage unavailable (private mode) — getVisitSnapshot fails open instead.
    }
    window.dispatchEvent(new Event(VISITS_EVENT));
  }, []);

  if (status === 'loading' || status === 'standalone') return null;
  if (dismissed) return null;
  if (!passedVisitGate) return null; // #1186 value-first gate (additive AND)

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage unavailable (private mode) — banner re-appears next load.
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }

  async function onInstall() {
    if (status === 'native') {
      await install();
      // After a native attempt the deferred prompt is consumed regardless
      // of accept/decline, so hide the banner — user has answered.
      dismiss();
    } else {
      setModalOpen(true);
    }
  }

  const modalVariant =
    status === 'ios-safari'
      ? 'ios-safari'
      : status === 'ios-other'
        ? 'ios-other'
        : 'unsupported';

  return (
    <>
      <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-text">
            {t('title')}
          </p>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
            {t('body')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onInstall}
            className="rounded-full bg-primary text-bg-tint px-3 py-1.5 text-xs font-medium min-h-11"
          >
            {t('install')}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('closeAria')}
            className="text-text-muted hover:text-text px-1.5 py-1 min-h-11 min-w-11 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      </div>
      <InstallInstructionsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        variant={modalVariant}
      />
    </>
  );
}
