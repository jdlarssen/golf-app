'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/Switch';
import { setAiConsent } from './actions';

/**
 * The AI texts switch on Profil (#2561), a row under «App» next to the monthly
 * digest. On means «ja»: the player can be named in round reports and in other
 * players' Kavalkade. No answer shows as off, because no row counts as «nei»
 * (`lib/ai/consent.ts`).
 *
 * Same optimistic switch as `MonthlyDigestToggle`: it rolls back and says so
 * when the save did not go through. This is a consent signal, and a switch
 * showing «ja» while the database holds «nei» would misreport it. For the
 * same reason it follows a new answer from the server (answered on Home in the
 * same visit) instead of keeping the one it mounted with, and it is locked
 * while a save is under way.
 */
export function AiConsentToggle({ initialGranted }: { initialGranted: boolean }) {
  const t = useTranslations('aiConsent');
  const [granted, setGranted] = useState(initialGranted);
  const [serverValue, setServerValue] = useState(initialGranted);
  const [failed, setFailed] = useState(false);
  const [saving, startTransition] = useTransition();

  // Adjusting state during render: a new server answer replaces the local one.
  if (serverValue !== initialGranted) {
    setServerValue(initialGranted);
    setGranted(initialGranted);
  }

  function toggle() {
    const previous = granted;
    const next = !granted;
    setGranted(next);
    startTransition(async () => {
      try {
        const result = await setAiConsent(next);
        if (!result?.ok) {
          setGranted(previous);
          setFailed(true);
          return;
        }
        if (failed) setFailed(false);
      } catch (err) {
        console.error('[profile] AI consent toggle failed', err);
        setGranted(previous);
        setFailed(true);
      }
    });
  }

  return (
    <div
      className="flex w-full items-center justify-between gap-3 min-h-[56px] px-5 py-3 border-t border-border first:border-t-0"
      data-testid="ai-consent-toggle"
    >
      <div className="min-w-0">
        <p className="font-serif text-base font-medium text-text">{t('toggleTitle')}</p>
        <p className="text-xs text-muted">{t('toggleSubtitle')}</p>
        {failed && (
          <p role="status" data-testid="ai-consent-toggle-error" className="mt-1 font-sans text-[12px] text-danger">
            {t('toggleFailed')}
          </p>
        )}
      </div>
      <Switch checked={granted} onToggle={toggle} label={t('toggleTitle')} disabled={saving} />
    </div>
  );
}
