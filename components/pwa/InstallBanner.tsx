'use client';

import { useState, useSyncExternalStore } from 'react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { InstallInstructionsModal } from './InstallInstructionsModal';

const DISMISS_KEY = 'torny-install-banner-dismissed';
const DISMISS_EVENT = 'torny-install-banner-change';

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

export function InstallBanner() {
  const { status, install } = useInstallPrompt();
  const dismissed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [modalOpen, setModalOpen] = useState(false);

  if (status === 'loading' || status === 'standalone') return null;
  if (dismissed) return null;

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
            Installer Tørny som app
          </p>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
            Raskere åpning, og du kan registrere slag uten dekning.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onInstall}
            className="rounded-full bg-primary text-bg-tint px-3 py-1.5 text-xs font-medium"
          >
            Installer
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Lukk"
            className="text-text-muted hover:text-text px-1.5 py-1"
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
