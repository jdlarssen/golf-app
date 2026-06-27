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

  // Section heading lives inside the component so it never dangles on desktop /
  // unsupported (where the component returns null above). Matches the other
  // profile sections' uppercase tracking label.
  const heading = (
    <p className="mb-2 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
      {t('sectionHeading')}
    </p>
  );

  if (state === 'ios-install') {
    return (
      <>
        {heading}
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="font-serif text-base font-medium text-text">{t('iosInstallTitle')}</p>
          <p className="mt-1 text-xs text-text-muted leading-relaxed">{t('iosInstallBody')}</p>
        </div>
      </>
    );
  }

  if (state === 'blocked') {
    return (
      <>
        {heading}
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="font-serif text-base font-medium text-text">{t('blockedTitle')}</p>
          <p className="mt-1 text-xs text-text-muted leading-relaxed">{t('blockedIntro')}</p>
          <ol className="mt-2 space-y-1 text-xs text-text list-decimal list-inside">
            <li>{t('blockedStep1')}</li>
            <li>{t('blockedStep2')}</li>
            <li>{t('blockedStep3')}</li>
          </ol>
          <p className="mt-2 text-xs text-text-muted">{t('blockedFootnote')}</p>
          <p className="mt-2 text-xs text-text-muted">{t('emailBackstop')}</p>
        </div>
      </>
    );
  }

  // 'off' or 'on' — one consistent switch control for both states.
  const on = state === 'on';
  return (
    <>
      {heading}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="min-w-0">
          <p className="font-serif text-base font-medium text-text">{t('title')}</p>
          <p className="text-xs text-text-muted">{on ? t('on') : t('permissionNote')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t('title')}
          onClick={on ? turnOff : turnOn}
          disabled={busy}
          className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 ${
            on ? 'bg-primary' : 'bg-text/20'
          }`}
        >
          <span
            className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${
              on ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </>
  );
}
