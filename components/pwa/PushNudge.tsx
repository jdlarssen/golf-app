'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isStandalone, isIos } from '@/lib/pwa/detect';
import { getPushState, enablePush, type PushState } from '@/lib/pwa/push';
import { savePushSubscription } from '@/app/[locale]/profile/pushActions';

const DISMISS_KEY = 'torny-push-nudge-dismissed';

/**
 * One-time post-install prompt to turn on push. MOBILE/TABLET ONLY: shown only
 * when running as an installed PWA (isStandalone) on a touch device, push is
 * supported but off, and the nudge hasn't been dismissed. Never on desktop. (#24)
 */
export function PushNudge() {
  const t = useTranslations('pushSettings');
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isStandalone()) return;            // installed PWA only
    if (!isIos() && !('ontouchstart' in window)) return; // touch (mobile/tablet) only
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch { /* private mode */ }
    if (dismissed) return;
    getPushState().then((s: PushState) => {
      if (s === 'off') setShow(true);
    });
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  }

  async function turnOn() {
    setBusy(true);
    try {
      const next = await enablePush(savePushSubscription);
      if (next === 'on') { setDone(true); dismiss(); }
      else setShow(false); // blocked/denied — the profile row explains it
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
        <p className="font-medium text-sm text-text">{t('nudgeDoneTitle')}</p>
        <p className="text-xs text-text-muted mt-0.5">{t('nudgeDoneBody')}</p>
      </div>
    );
  }
  if (!show) return null;

  return (
    <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 p-4">
      <p className="font-medium text-sm text-text">{t('nudgeTitle')}</p>
      <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{t('nudgeBody')}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          className="rounded-full bg-primary text-bg-tint px-4 py-2 text-sm font-medium min-h-11 disabled:opacity-50"
        >
          {t('enable')}
        </button>
        <button type="button" onClick={dismiss} className="text-text-muted text-sm px-3 min-h-11">
          {t('nudgeLater')}
        </button>
      </div>
    </div>
  );
}
