'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/Switch';
import { toggleProductUpdates } from './actions';

/**
 * Kompakt månedsbrev-bryter i Innboks. Optimistisk lokal state + server-action
 * som lagrer. Eierskapet for product-updates-opt-in flyttet hit fra profil-
 * skjemaet (#401) — det hører hjemme der varsler bor.
 */
export function MonthlyDigestToggle({ initialOptIn }: { initialOptIn: boolean }) {
  const t = useTranslations('inbox');
  const [optIn, setOptIn] = useState(initialOptIn);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !optIn;
    setOptIn(next);
    startTransition(() => {
      void toggleProductUpdates(next);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="font-serif text-base font-medium text-text">{t('monthlyDigestTitle')}</p>
        <p className="text-xs text-muted">{t('monthlyDigestSubtitle')}</p>
      </div>
      <Switch
        checked={optIn}
        onToggle={toggle}
        label={t('monthlyDigestAriaLabel')}
      />
    </div>
  );
}
