'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/Switch';
import { toggleProductUpdates } from './actions';

/**
 * The monthly digest switch, a row under «App» on Profil next to the push
 * settings (#2263, owner's answer 16 — it was at the bottom of the inbox,
 * #1799). Same row as Språk and Tema.
 *
 * Optimistic local state plus a server action that saves. It rolls back and
 * says so when the save did not go through (#1394): this is a consent signal,
 * and a switch left off while the database says on makes the user think they
 * unsubscribed when nothing was saved. The action checks the write itself
 * (0 rows = failure, trap 2).
 */
export function MonthlyDigestToggle({ initialOptIn }: { initialOptIn: boolean }) {
  const t = useTranslations('profile');
  const [optIn, setOptIn] = useState(initialOptIn);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  function toggle() {
    const previous = optIn;
    const next = !optIn;
    setOptIn(next);
    startTransition(async () => {
      try {
        const result = await toggleProductUpdates(next);
        if (!result?.ok) {
          setOptIn(previous);
          setFailed(true);
          return;
        }
        if (failed) setFailed(false);
      } catch (err) {
        console.error('[profile] monthly digest toggle failed', err);
        setOptIn(previous);
        setFailed(true);
      }
    });
  }

  return (
    <div
      className="flex w-full items-center justify-between gap-3 min-h-[56px] px-5 py-3 border-t border-border first:border-t-0"
      data-testid="monthly-digest-toggle"
    >
      <div className="min-w-0">
        <p className="font-serif text-base font-medium text-text">{t('monthlyDigestTitle')}</p>
        <p className="text-xs text-muted">{t('monthlyDigestSubtitle')}</p>
        {failed && (
          <p role="status" data-testid="monthly-digest-error" className="mt-1 font-sans text-[12px] text-danger">
            {t('monthlyDigestFailed')}
          </p>
        )}
      </div>
      <Switch checked={optIn} onToggle={toggle} label={t('monthlyDigestAriaLabel')} />
    </div>
  );
}
