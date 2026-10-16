'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { setAiConsent } from '@/app/[locale]/profile/actions';

/**
 * The AI question on Home (#2561), first in the nudge queue
 * (`lib/home/nudgeQueue.ts`) for as long as the player has not answered. Same
 * text and the same two buttons as the app's question, and no «senere»: an
 * answer that waits counts as «nei» (`lib/ai/consent.ts`), so a third choice
 * would only put the question off. The buttons look alike, so neither is the
 * default.
 *
 * `HomeNudges` decides on the server whether the card shows. Here there is the
 * save and nothing else. A saved answer hides the card; one that did not go
 * through keeps it, with a line saying so, and the buttons can be pressed
 * again.
 */
export function AiConsentHomeNudge() {
  const t = useTranslations('aiConsent');
  const [answered, setAnswered] = useState(false);
  const [pending, setPending] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  if (answered) return null;

  function answer(granted: boolean) {
    setPending(granted);
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await setAiConsent(granted);
        if (!result?.ok) {
          setFailed(true);
          return;
        }
        setAnswered(true);
      } catch (err) {
        console.error('[aiConsent] home card save failed', err);
        setFailed(true);
      } finally {
        setPending(null);
      }
    });
  }

  const busy = pending !== null;
  const button = (granted: boolean, label: string, testId: string) => (
    <button
      type="button"
      data-testid={testId}
      onClick={() => answer(granted)}
      disabled={busy}
      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-primary px-4 py-2 font-sans text-[13px] font-medium text-bg transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      {pending === granted ? t('saving') : label}
    </button>
  );

  return (
    <div
      data-testid="ai-consent-home-nudge"
      className="relative mb-4 overflow-hidden rounded-xl border border-border bg-surface px-4 py-3 pl-5"
    >
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full"
        style={{ background: 'var(--accent)' }}
      />
      <p className="font-sans text-[14px] font-medium leading-tight text-text">{t('title')}</p>
      <p className="mt-1 font-sans text-[13px] leading-snug text-muted">{t('body')}</p>
      <p className="mt-2 font-sans text-[13px] leading-snug text-muted">{t('noMeans')}</p>
      {failed && (
        <p
          role="status"
          data-testid="ai-consent-home-error"
          className="mt-2 font-sans text-[12px] text-danger"
        >
          {t('saveFailed')}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {button(true, t('yes'), 'ai-consent-home-yes')}
        {button(false, t('no'), 'ai-consent-home-no')}
      </div>
    </div>
  );
}
