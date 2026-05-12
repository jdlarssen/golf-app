'use client';

import { useState, useSyncExternalStore } from 'react';

const DISMISS_KEY = 'golf-ios-install-dismissed';

function subscribe() {
  return () => {};
}

function readShouldShow(): boolean {
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
  return isIOS && !isStandalone && !dismissed;
}

function readServerShouldShow(): boolean {
  return false;
}

/**
 * Shows a small banner on iOS Safari nudging the user to add the app to the
 * home screen. iOS does not surface a built-in install prompt (unlike Chrome),
 * so we hand-roll one. Skipped on Android (Chrome shows its own prompt) and
 * skipped once the app is already running in standalone mode.
 */
export function IosInstallHint() {
  const shouldShow = useSyncExternalStore(
    subscribe,
    readShouldShow,
    readServerShouldShow,
  );
  const [dismissed, setDismissed] = useState(false);

  if (!shouldShow || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore.
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Installer Tørny"
      className="fixed inset-x-3 bottom-3 z-50 rounded-xl bg-primary text-bg-tint px-4 py-3 shadow-lg text-sm"
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 leading-snug">
          For å installere Tørny: trykk på{' '}
          <span aria-label="del-knappen" role="img">
            ⎙
          </span>{' '}
          og velg «Legg til på Hjem-skjerm».
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Lukk"
          className="text-bg-tint/70 hover:text-bg-tint -mt-1 px-1 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
