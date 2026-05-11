'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'golf-ios-install-dismissed';

/**
 * Shows a small banner on iOS Safari nudging the user to add the app to the
 * home screen. iOS does not surface a built-in install prompt (unlike Chrome),
 * so we hand-roll one. Skipped on Android (Chrome shows its own prompt) and
 * skipped once the app is already running in standalone mode.
 */
export function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      // Private mode / disabled storage — treat as not dismissed.
    }
    if (isIOS && !isStandalone && !dismissed) setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore.
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Installer Golf-app"
      className="fixed inset-x-3 bottom-3 z-50 rounded-xl bg-zinc-900 text-zinc-100 px-4 py-3 shadow-lg text-sm"
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 leading-snug">
          For best opplevelse: trykk på{' '}
          <span aria-label="del-knappen" role="img">
            ⎙
          </span>{' '}
          og velg «Legg til på hjemskjerm».
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Lukk"
          className="text-zinc-400 hover:text-zinc-100 -mt-1 px-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
