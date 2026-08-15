'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/Switch';
import { toggleProductUpdates } from './actions';

/**
 * Kompakt månedsbrev-bryter i Innboks. Optimistisk lokal state + server-action
 * som lagrer. Eierskapet for product-updates-opt-in flyttet hit fra profil-
 * skjemaet (#401) — det hører hjemme der varsler bor.
 *
 * Bryteren ruller tilbake og sier fra når lagringen ikke gikk gjennom (#1394).
 * Dette er et samtykke-signal: en bryter som blir stående av mens DB-en sier
 * på, får brukeren til å tro hen har meldt seg av månedsbrevet uten at det er
 * lagret. Action-en verifiserer selve skrivingen (0 rader = feil, trap 2).
 */
export function MonthlyDigestToggle({ initialOptIn }: { initialOptIn: boolean }) {
  const t = useTranslations('inbox');
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
        console.error('[innboks] monthly digest toggle failed', err);
        setOptIn(previous);
        setFailed(true);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
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
      {failed && (
        <p
          role="status"
          data-testid="inbox-action-error"
          className="mt-2 font-sans text-[12px] text-danger"
        >
          {t('actionFailed')}
        </p>
      )}
    </div>
  );
}
