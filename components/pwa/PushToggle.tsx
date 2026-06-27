'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  getPushState,
  enablePush,
  disablePush,
  type PushState,
} from '@/lib/pwa/push';
import { savePushSubscription, removePushSubscription } from '@/app/[locale]/profile/pushActions';

export function PushToggle() {
  const t = useTranslations('pushSettings');
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  // On desktop + Android + installed iOS this renders the toggle; on iOS Safari
  // tab it renders the install hint; when unsupported it renders nothing.
  if (state === 'loading' || state === 'unsupported') return null;

  async function turnOn() {
    setBusy(true);
    try {
      setState(await enablePush(savePushSubscription));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      setState(await disablePush(removePushSubscription));
    } finally {
      setBusy(false);
    }
  }

  if (state === 'ios-install') {
    return (
      <div className="rounded-xl border border-border bg-bg-tint p-4">
        <p className="font-medium text-sm text-text">{t('iosInstallTitle')}</p>
        <p className="mt-1 text-xs text-text-muted leading-relaxed">{t('iosInstallBody')}</p>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div className="rounded-xl border border-border bg-bg-tint p-4">
        <p className="font-medium text-sm text-text">{t('blockedTitle')}</p>
        <p className="mt-1 text-xs text-text-muted leading-relaxed">{t('blockedIntro')}</p>
        <ol className="mt-2 space-y-1 text-xs text-text list-decimal list-inside">
          <li>{t('blockedStep1')}</li>
          <li>{t('blockedStep2')}</li>
          <li>{t('blockedStep3')}</li>
        </ol>
        <p className="mt-2 text-xs text-text-muted">{t('blockedFootnote')}</p>
        <p className="mt-2 text-xs text-text-muted">{t('emailBackstop')}</p>
      </div>
    );
  }

  // 'off' or 'on'
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-text">{t('title')}</p>
        <p className="text-xs text-text-muted">{state === 'on' ? t('on') : t('off')}</p>
      </div>
      {state === 'on' ? (
        <button
          type="button"
          onClick={turnOff}
          disabled={busy}
          role="switch"
          aria-checked="true"
          aria-label={t('title')}
          className="relative h-7 w-12 rounded-full bg-primary transition-colors disabled:opacity-50"
        >
          <span className="absolute top-[3px] left-[23px] h-[22px] w-[22px] rounded-full bg-white" />
        </button>
      ) : (
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          className="rounded-full bg-primary text-bg-tint px-4 py-2 text-sm font-medium min-h-11 disabled:opacity-50"
        >
          {t('enable')}
        </button>
      )}
    </div>
  );
}
